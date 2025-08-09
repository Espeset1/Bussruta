const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Game state management
const rooms = new Map();

// Card deck setup
const suits = ['♠', '♣', '♥', '♦'];
const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
    const deck = [];
    suits.forEach(suit => {
        values.forEach(value => {
            deck.push({ suit, value, id: `${value}${suit}` });
        });
    });
    return shuffleDeck(deck);
}

function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function createPyramid() {
    // Pyramid structure: [cards count, sips per card]
    return [
        { cards: 5, sips: 1, level: 0 },
        { cards: 4, sips: 2, level: 1 },
        { cards: 3, sips: 4, level: 2 },
        { cards: 2, sips: 6, level: 3 },
        { cards: 1, sips: 8, level: 4 }
    ];
}

function createRoom(roomCode) {
    const pyramid = createPyramid();
    const totalPyramidCards = pyramid.reduce((sum, level) => sum + level.cards, 0);
    
    return {
        code: roomCode,
        players: new Map(),
        gameState: 'lobby', // lobby, playing, busroute, finished
        deck: createDeck(),
        pyramid: pyramid,
        pyramidCards: Array(totalPyramidCards).fill(null), // actual cards in pyramid positions
        currentRound: 0,
        currentCard: 0,
        playerHands: new Map(),
        playedCards: new Map(), // track which cards have been played on pyramid
        drinkConfirmations: new Map(), // track pending drink confirmations
        busRoutePlayer: null,
        cardCounts: new Map()
    };
}

// Socket connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Create or join room
    socket.on('createRoom', (playerName) => {
        const roomCode = generateRoomCode();
        const room = createRoom(roomCode);
        rooms.set(roomCode, room);
        
        const player = {
            id: socket.id,
            name: playerName,
            room: roomCode,
            hand: [],
            cardsPlayed: 0
        };
        
        room.players.set(socket.id, player);
        socket.join(roomCode);
        
        socket.emit('roomCreated', { roomCode, player });
        io.to(roomCode).emit('playerJoined', Array.from(room.players.values()));
    });

    socket.on('joinRoom', ({ roomCode, playerName }) => {
        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        if (room.gameState !== 'lobby') {
            socket.emit('error', 'Game already in progress');
            return;
        }
        
        const player = {
            id: socket.id,
            name: playerName,
            room: roomCode,
            hand: [],
            cardsPlayed: 0
        };
        
        room.players.set(socket.id, player);
        socket.join(roomCode);
        
        socket.emit('roomJoined', { roomCode, player });
        io.to(roomCode).emit('playerJoined', Array.from(room.players.values()));
    });

    // Start game
    socket.on('startGame', () => {
        const player = findPlayerInRoom(socket.id);
        if (!player) return;
        
        const room = rooms.get(player.room);
        if (room.players.size < 2) {
            socket.emit('error', 'Need at least 2 players to start');
            return;
        }
        
        // Setup pyramid cards
        const totalPyramidCards = room.pyramid.reduce((sum, level) => sum + level.cards, 0);
        room.pyramidCards = room.deck.splice(0, totalPyramidCards);
        
        // Deal remaining cards to players
        const playersArray = Array.from(room.players.values());
        const cardsPerPlayer = Math.floor(room.deck.length / playersArray.length);
        
        playersArray.forEach(player => {
            const hand = room.deck.splice(0, cardsPerPlayer);
            room.playerHands.set(player.id, hand);
            player.hand = hand;
        });
        
        room.gameState = 'playing';
        room.currentCard = 0;
        
        io.to(player.room).emit('gameStarted', {
            pyramid: room.pyramid,
            players: Array.from(room.players.values()),
            currentCard: room.currentCard
        });
        
        // Send hands privately to each player
        playersArray.forEach(player => {
            io.to(player.id).emit('handDealt', room.playerHands.get(player.id));
        });
        
        // Reveal first card
        revealNextCard(room);
    });

    // Play card
    socket.on('playCard', ({ cardId }) => {
        const player = findPlayerInRoom(socket.id);
        if (!player) return;
        
        const room = rooms.get(player.room);
        if (room.gameState !== 'playing') return;
        
        const playerHand = room.playerHands.get(socket.id);
        const cardIndex = playerHand.findIndex(card => card.id === cardId);
        
        if (cardIndex === -1) return; // Card not in hand
        
        const currentPyramidCard = room.pyramidCards[room.currentCard];
        const playedCard = playerHand[cardIndex];
        
        // Check if cards match
        if (playedCard.value === currentPyramidCard.value) {
            // Remove card from hand
            playerHand.splice(cardIndex, 1);
            player.cardsPlayed++;
            
            // Add to played cards
            room.playedCards.set(room.currentCard, {
                card: playedCard,
                playerId: socket.id,
                playerName: player.name
            });
            
            // Calculate sips based on pyramid level
            const pyramidLevel = getPyramidLevel(room.currentCard, room.pyramid);
            const sips = pyramidLevel.sips;
            
            io.to(player.room).emit('cardPlayed', {
                playerId: socket.id,
                playerName: player.name,
                card: playedCard,
                position: room.currentCard,
                sips: sips
            });
            
            // Player chooses who drinks
            socket.emit('chooseDrinker', { sips, cardPosition: room.currentCard });
            
            // Move to next card after drink assignment
            // This will be handled after drink confirmation
        }
    });

    // Assign drinks
    socket.on('assignDrinks', ({ targetPlayerId, sips, cardPosition }) => {
        const player = findPlayerInRoom(socket.id);
        if (!player) return;
        
        const room = rooms.get(player.room);
        
        // Handle both player ID and player name for compatibility
        let targetPlayer = room.players.get(targetPlayerId);
        if (!targetPlayer) {
            // Try to find by name if ID doesn't work
            for (const [id, p] of room.players) {
                if (p.name === targetPlayerId) {
                    targetPlayer = p;
                    targetPlayerId = id;
                    break;
                }
            }
        }
        
        if (!targetPlayer) return;
        
        // Create drink confirmation
        const confirmationId = uuidv4();
        room.drinkConfirmations.set(confirmationId, {
            playerId: targetPlayerId,
            sips: sips,
            cardPosition: cardPosition,
            confirmed: 0
        });
        
        io.to(targetPlayerId).emit('mustDrink', {
            confirmationId,
            sips,
            from: player.name,
            cardPosition
        });
        
        io.to(player.room).emit('drinksAssigned', {
            from: player.name,
            to: targetPlayer.name,
            sips
        });
    });

    // Confirm drink
    socket.on('confirmDrink', ({ confirmationId }) => {
        const player = findPlayerInRoom(socket.id);
        if (!player) return;
        
        const room = rooms.get(player.room);
        const confirmation = room.drinkConfirmations.get(confirmationId);
        
        if (!confirmation || confirmation.playerId !== socket.id) return;
        
        confirmation.confirmed++;
        
        if (confirmation.confirmed >= confirmation.sips) {
            room.drinkConfirmations.delete(confirmationId);
            
            io.to(player.room).emit('drinkConfirmed', {
                playerName: player.name,
                sips: confirmation.sips
            });
            
            // Move to next card
            setTimeout(() => {
                revealNextCard(room);
            }, 1000);
        } else {
            socket.emit('drinkProgress', {
                confirmed: confirmation.confirmed,
                total: confirmation.sips
            });
        }
    });

    // Next card (host only)
    socket.on('nextCard', () => {
        const player = findPlayerInRoom(socket.id);
        if (!player) return;
        
        const room = rooms.get(player.room);
        if (room.gameState !== 'playing') return;
        
        // Only allow the host (first player) to advance cards
        const players = Array.from(room.players.values());
        if (players.length === 0 || players[0].id !== socket.id) {
            socket.emit('error', 'Kun hosten kan gå til neste kort');
            return;
        }
        
        room.currentCard++;
        revealNextCard(room);
    });
    socket.on('clickBusRouteCard', ({ level, position }) => {
        const player = findPlayerInRoom(socket.id);
        if (!player) return;
        
        const room = rooms.get(player.room);
        if (room.gameState !== 'busroute' || room.busRoutePlayer !== socket.id) return;
        
        // Get current level info
        const pyramidLevel = room.pyramid[level];
        if (!pyramidLevel) return;
        
        // Draw a random card from the clicked position
        const suits = ['♠', '♣', '♥', '♦'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const randomSuit = suits[Math.floor(Math.random() * suits.length)];
        const randomValue = values[Math.floor(Math.random() * values.length)];
        const drawnCard = { suit: randomSuit, value: randomValue };
        
        // Check if it's a face card (A=14, J=11, Q=12, K=13)
        const isFaceCard = ['A', 'J', 'Q', 'K'].includes(randomValue);
        
        // Update the specific pyramid card at this position
        const totalPosition = position;
        room.pyramidCards[totalPosition] = drawnCard;
        
        // Reveal the card to all players
        io.to(room.code).emit('cardRevealed', {
            card: drawnCard,
            position: totalPosition,
            pyramidLevel: pyramidLevel
        });
        
        if (isFaceCard) {
            // Player must drink and restart - shuffle pyramid
            io.to(room.code).emit('busRouteFaceCard', {
                card: drawnCard,
                level: level,
                sips: pyramidLevel.sips,
                player: player.name
            });
            
            // Shuffle and reset pyramid
            setTimeout(() => {
                shuffleBusRoutePyramid(room);
                io.to(socket.id).emit('busRouteRestart');
            }, 2000);
        } else {
            // Continue to next level
            io.to(room.code).emit('busRouteSuccess', {
                card: drawnCard,
                level: level,
                player: player.name
            });
            
            if (level >= room.pyramid.length - 1) {
                // Player completed bus route!
                room.gameState = 'finished';
                io.to(room.code).emit('gameFinished', {
                    winner: player.name
                });
            } else {
                // Continue to next level
                setTimeout(() => {
                    io.to(socket.id).emit('continueToNextLevel', { nextLevel: level + 1 });
                }, 1500);
            }
        }
    });
    
    socket.on('drawBusRouteCard', ({ level }) => {
        // Redirect to new click-based system
        const player = findPlayerInRoom(socket.id);
        if (!player) return;
        
        const room = rooms.get(player.room);
        if (room.gameState !== 'busroute' || room.busRoutePlayer !== socket.id) return;
        
        // Find a card at the current level and simulate a click
        let position = 0;
        for (let i = 0; i < level; i++) {
            position += room.pyramid[i].cards;
        }
        
        // Simulate clicking the first card of the level
        socket.emit('clickBusRouteCard', { level, position });
    });
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        // Find and remove player from room
        for (const [roomCode, room] of rooms.entries()) {
            if (room.players.has(socket.id)) {
                room.players.delete(socket.id);
                room.playerHands.delete(socket.id);
                
                if (room.players.size === 0) {
                    rooms.delete(roomCode);
                } else {
                    io.to(roomCode).emit('playerLeft', Array.from(room.players.values()));
                }
                break;
            }
        }
    });
});

// Helper functions
function findPlayerInRoom(socketId) {
    for (const room of rooms.values()) {
        if (room.players.has(socketId)) {
            return room.players.get(socketId);
        }
    }
    return null;
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getPyramidLevel(cardPosition, pyramid) {
    let position = 0;
    for (const level of pyramid) {
        if (cardPosition < position + level.cards) {
            return level;
        }
        position += level.cards;
    }
    return pyramid[pyramid.length - 1]; // fallback
}

function revealNextCard(room) {
    if (room.currentCard >= room.pyramidCards.length) {
        // Game phase 1 complete, count cards
        const cardCounts = new Map();
        for (const [playerId, player] of room.players) {
            const remainingCards = room.playerHands.get(playerId).length;
            cardCounts.set(playerId, remainingCards);
            room.cardCounts.set(playerId, remainingCards);
        }
        
        // Find player with most cards
        let maxCards = 0;
        let busRoutePlayers = [];
        
        for (const [playerId, count] of cardCounts) {
            if (count > maxCards) {
                maxCards = count;
                busRoutePlayers = [playerId];
            } else if (count === maxCards) {
                busRoutePlayers.push(playerId);
            }
        }
        
        // Notify about card counts
        const cardCountsArray = Array.from(room.players.entries()).map(([id, player]) => ({
            name: player.name,
            cards: cardCounts.get(id)
        }));
        
        io.to(room.code).emit('phaseOneComplete', { cardCounts: cardCountsArray });
        
        // Wait a moment then determine bus route player
        setTimeout(() => {
            if (busRoutePlayers.length === 1) {
                room.busRoutePlayer = busRoutePlayers[0];
                startBusRoute(room);
            } else {
                // Tie-breaker needed
                const tiePlayerNames = busRoutePlayers.map(id => room.players.get(id).name);
                io.to(room.code).emit('tieBreaker', {
                    players: tiePlayerNames,
                    maxCards: maxCards
                });
                
                // For simplicity, pick first player in tie
                setTimeout(() => {
                    room.busRoutePlayer = busRoutePlayers[0];
                    startBusRoute(room);
                }, 3000);
            }
        }, 2000);
        
        return;
    }
    
    const currentCard = room.pyramidCards[room.currentCard];
    
    io.to(room.code).emit('cardRevealed', {
        card: currentCard,
        position: room.currentCard,
        pyramidLevel: getPyramidLevel(room.currentCard, room.pyramid)
    });
    
    // No auto-advance - only host can advance cards manually
}

function shuffleBusRoutePyramid(room) {
    // Shuffle and reset pyramid for bus route
    room.deck = shuffleDeck(createDeck());
    const totalPyramidCards = room.pyramid.reduce((sum, level) => sum + level.cards, 0);
    room.pyramidCards = room.deck.splice(0, totalPyramidCards);
    
    // Notify all players that pyramid was shuffled
    io.to(room.code).emit('pyramidShuffled', { pyramid: room.pyramid });
}

function startBusRoute(room) {
    room.gameState = 'busroute';
    
    // Reset pyramid for bus route
    shuffleBusRoutePyramid(room);
    room.currentCard = 0;
    
    const busRoutePlayer = room.players.get(room.busRoutePlayer);
    
    io.to(room.code).emit('busRouteStarted', {
        player: busRoutePlayer.name,
        pyramid: room.pyramid
    });
    
    // Start bus route for the designated player
    io.to(room.busRoutePlayer).emit('startBusRoute');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Bussruta server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to play`);
});