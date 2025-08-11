// Bussruta Multiplayer Client JavaScript
let socket;
let currentPlayer = null;
let currentRoom = null;
let playerHand = [];
let currentGameState = 'lobby';
let pendingDrinkConfirmation = null;
let allPlayers = []; // Store all players data

document.addEventListener('DOMContentLoaded', function() {
    initializeSocket();
    initializeEventListeners();
    initializePyramid(); // Keep original pyramid for rules display
});

function initializeSocket() {
    socket = io();
    
    // Socket event listeners
    socket.on('roomCreated', ({ roomCode, player }) => {
        currentPlayer = player;
        currentRoom = roomCode;
        showGameSection();
        updateRoomDisplay();
        showNotification(`Spill opprettet! Romkode: ${roomCode}`, 'success');
    });
    
    socket.on('roomJoined', ({ roomCode, player }) => {
        currentPlayer = player;
        currentRoom = roomCode;
        showGameSection();
        updateRoomDisplay();
        showNotification(`Ble med i spill! Romkode: ${roomCode}`, 'success');
    });
    
    socket.on('playerJoined', (players) => {
        allPlayers = players; // Store all players
        updatePlayersList(players);
    });
    
    socket.on('playerLeft', (players) => {
        allPlayers = players; // Update all players
        updatePlayersList(players);
    });
    
    socket.on('gameStarted', ({ pyramid, players, currentCard }) => {
        allPlayers = players; // Update all players
        showPlayingSection();
        initializeGamePyramid(pyramid);
        updatePlayersList(players);
        updateOtherPlayersSidebar(players);
        updateGameStatus('Spillet startet!');
        
        // Show/hide next card button based on if user is host
        const isHost = currentPlayer.id === players[0].id;
        updateNextCardButton(isHost);
        
        showNotification('Spillet har startet! Sjekk kortene dine.', 'success');
    });
    
    socket.on('handDealt', (hand) => {
        playerHand = hand;
        updatePlayerHand();
        updateHandCount();
    });
    
    socket.on('cardRevealed', ({ card, position, pyramidLevel }) => {
        revealPyramidCard(card, position);
        updateCurrentCardInfo(card, pyramidLevel);
        highlightPlayableCards(card);
        showNotification(`Nytt kort: ${card.value}${card.suit}`, 'info');
    });
    
    socket.on('cardPlayed', ({ playerId, playerName, card, cards, cardsCount, position, sips, stackCount }) => {
        // Handle both legacy single card format and new multiple cards format
        const playedCards = cards || [card];
        const cardCount = cardsCount || 1;
        
        // Show all cards on pyramid (only show the first card visually)
        showCardOnPyramid(playedCards[0], position, stackCount);
        
        // Create notification message
        let message;
        if (cardCount === 1) {
            message = `${playerName} spilte ${playedCards[0].value}${playedCards[0].suit}!`;
        } else {
            const cardNames = playedCards.map(c => `${c.value}${c.suit}`).join(', ');
            message = `${playerName} spilte ${cardCount} kort (${cardNames}) og deler ut ${sips} slurker!`;
        }
        
        showNotification(message, 'success');
        updateHandCount();
    });
    
    socket.on('playersUpdated', (players) => {
        allPlayers = players;
        updateOtherPlayersSidebar(players);
    });
    
    socket.on('chooseDrinker', ({ sips, cardPosition }) => {
        showChooseDrinker(sips);
    });
    
    socket.on('mustDrink', ({ confirmationId, sips, from, cardPosition }) => {
        pendingDrinkConfirmation = confirmationId;
        showDrinkConfirmation(sips, from);
    });
    
    socket.on('drinkProgress', ({ confirmed, total }) => {
        updateDrinkProgress(confirmed, total);
    });
    
    socket.on('drinkConfirmed', ({ playerName, sips }) => {
        hideDrinkConfirmation();
        showNotification(`${playerName} har drukket ${sips} slurk${sips > 1 ? 'er' : ''}!`, 'info');
    });
    
    socket.on('drinksAssigned', ({ from, to, sips }) => {
        hideChooseDrinker();
        showNotification(`${from} ga ${sips} slurk${sips > 1 ? 'er' : ''} til ${to}`, 'info');
    });
    
    socket.on('busRouteStarted', ({ player, pyramid }) => {
        showNotification(`${player} må ta bussruten!`, 'warning');
        updateGameStatus(`${player} tar bussruten`);
        
        // If this player is taking the bus route, show bus route interface
        if (player === currentPlayer.name) {
            showBusRouteInterface();
        }
    });
    
    socket.on('startBusRoute', () => {
        showBusRouteInterface();
    });
    
    socket.on('busRouteFaceCard', ({ card, level, sips, player }) => {
        showNotification(`${player} trakk ${card.value}${card.suit} - bildekort! Drikk ${sips} slurk${sips > 1 ? 'er' : ''} og start på nytt!`, 'warning');
    });
    
    socket.on('busRouteSuccess', ({ card, level, player }) => {
        showNotification(`${player} trakk ${card.value}${card.suit} - godt trukket!`, 'success');
    });
    
    socket.on('busRouteRestart', () => {
        showNotification('Start bussruten på nytt fra bunnen!', 'warning');
        updateBusRouteLevel(0);
        
        // Reset pyramid display to blank cards
        const pyramidCards = document.querySelectorAll('.pyramid-card .card-content');
        pyramidCards.forEach(cardContent => {
            cardContent.innerHTML = '';
        });
        
        // Remove revealed classes
        const allPyramidCards = document.querySelectorAll('.pyramid-card');
        allPyramidCards.forEach(card => {
            card.classList.remove('revealed', 'face-card');
        });
        
        makePyramidClickableForBusRoute();
    });
    
    socket.on('pyramidShuffled', ({ pyramid }) => {
        showNotification('Pyramiden ble stokket om!', 'info');
        
        // Reset pyramid display
        const pyramidCards = document.querySelectorAll('.pyramid-card .card-content');
        pyramidCards.forEach(cardContent => {
            cardContent.innerHTML = '';
        });
        
        // Remove all classes
        const allPyramidCards = document.querySelectorAll('.pyramid-card');
        allPyramidCards.forEach(card => {
            card.classList.remove('revealed', 'face-card', 'has-played-card', 'clickable-bus-route');
            // Remove any stacked cards
            const stackedCards = card.querySelectorAll('.stacked-card');
            stackedCards.forEach(sc => sc.remove());
        });
    });
    
    socket.on('continueToNextLevel', ({ nextLevel }) => {
        updateBusRouteLevel(nextLevel);
    });
    
    socket.on('gameFinished', ({ winner }) => {
        showNotification(`🎉 ${winner} fullførte bussruten og vant spillet!`, 'success');
        updateGameStatus('Spill ferdig!');
        setTimeout(() => {
            if (confirm('Spillet er ferdig! Vil du starte et nytt spill?')) {
                location.reload();
            }
        }, 3000);
    });
    
    socket.on('showCelebration', () => {
        showCelebrationModal();
    });
    
    socket.on('activityLogUpdate', (activityLog) => {
        updateActivityLog(activityLog);
    });
    
    socket.on('phaseOneComplete', ({ cardCounts }) => {
        showNotification('Fase 1 ferdig! Teller kort...', 'info');
        
        // Display card counts
        let message = 'Kort på hånd:\n';
        cardCounts.forEach(player => {
            message += `${player.name}: ${player.cards} kort\n`;
        });
        
        setTimeout(() => {
            showNotification(message, 'info');
        }, 1000);
    });
    
    socket.on('tieBreaker', ({ players, maxCards }) => {
        const playerList = players.join(' og ');
        showNotification(`Uavgjort! ${playerList} har begge ${maxCards} kort. Velger tilfeldig...`, 'warning');
    });
    
    socket.on('error', (message) => {
        showNotification(message, 'error');
    });
}

function initializeEventListeners() {
    // Lobby event listeners
    document.getElementById('create-room-btn').addEventListener('click', createRoom);
    document.getElementById('join-room-btn').addEventListener('click', joinRoom);
    document.getElementById('start-game-btn').addEventListener('click', startGame);
    
    // Game navigation
    document.getElementById('leave-game').addEventListener('click', leaveLobby);
    document.getElementById('leave-playing').addEventListener('click', leaveLobby);
    
    // Game actions
    document.getElementById('confirm-drink-btn').addEventListener('click', confirmDrink);
    
    // Celebration modal
    document.getElementById('celebration-close').addEventListener('click', closeCelebrationModal);
    
    // Test button for advancing cards
    document.getElementById('next-card-btn').addEventListener('click', () => {
        socket.emit('nextCard');
    });
    
    // Enter key handling for inputs
    document.getElementById('player-name').addEventListener('keypress', handleEnterKey);
    document.getElementById('room-code').addEventListener('keypress', handleEnterKey);
    document.getElementById('join-player-name').addEventListener('keypress', handleEnterKey);
}

function handleEnterKey(event) {
    if (event.key === 'Enter') {
        if (event.target.id === 'player-name') {
            createRoom();
        } else if (event.target.id === 'room-code' || event.target.id === 'join-player-name') {
            joinRoom();
        }
    }
}

function createRoom() {
    const playerName = document.getElementById('player-name').value.trim();
    if (!playerName) {
        showNotification('Vennligst skriv inn navn', 'error');
        return;
    }
    
    socket.emit('createRoom', playerName);
}

function joinRoom() {
    const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
    const playerName = document.getElementById('join-player-name').value.trim();
    
    if (!roomCode || !playerName) {
        showNotification('Vennligst fyll inn både romkode og navn', 'error');
        return;
    }
    
    socket.emit('joinRoom', { roomCode, playerName });
}

function startGame() {
    socket.emit('startGame');
}

function leaveLobby() {
    location.reload(); // Simple way to reset the application
}

function showGameSection() {
    document.getElementById('lobby-section').style.display = 'none';
    document.getElementById('game-section').style.display = 'block';
    document.getElementById('playing-section').style.display = 'none';
    currentGameState = 'lobby';
}

function showPlayingSection() {
    document.getElementById('lobby-section').style.display = 'none';
    document.getElementById('game-section').style.display = 'none';
    document.getElementById('playing-section').style.display = 'block';
    currentGameState = 'playing';
}

function updateRoomDisplay() {
    document.getElementById('room-code-display').textContent = `Romkode: ${currentRoom}`;
    document.getElementById('playing-room-code').textContent = `Romkode: ${currentRoom}`;
}

function updatePlayersList(players) {
    const container = document.getElementById('players-container');
    container.innerHTML = '';
    
    players.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        if (player.id === currentPlayer.id) {
            playerCard.classList.add('current-player');
        }
        playerCard.innerHTML = `
            <strong>${player.name}</strong>
            <div>Kort: ${player.hand ? player.hand.length : 0}</div>
        `;
        container.appendChild(playerCard);
    });
    
    document.getElementById('player-count').textContent = players.length;
    
    // Show start button for any player in the room
    const startBtn = document.getElementById('start-game-btn');
    if (players.length >= 1) {
        startBtn.style.display = 'block';
    } else {
        startBtn.style.display = 'none';
    }
}

function updateGameStatus(status) {
    document.getElementById('game-status').textContent = status;
}

function updateOtherPlayersSidebar(players) {
    const sidebarContainer = document.getElementById('other-players-list');
    if (!sidebarContainer) return; // Element doesn't exist if not in playing section
    
    // Filter out current player
    const otherPlayers = players.filter(player => player.id !== currentPlayer.id);
    
    sidebarContainer.innerHTML = '';
    
    otherPlayers.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'other-player-card';
        
        const playerName = document.createElement('div');
        playerName.className = 'other-player-name';
        playerName.textContent = player.name;
        
        const cardsDisplay = document.createElement('div');
        cardsDisplay.className = 'player-cards-display';
        
        // Show card backs for the number of cards the player has
        const cardCount = player.hand ? player.hand.length : 0;
        for (let i = 0; i < Math.min(cardCount, 15); i++) { // Cap at 15 to avoid overflow
            const cardBack = document.createElement('div');
            cardBack.className = 'card-back';
            cardsDisplay.appendChild(cardBack);
        }
        
        const cardsCountText = document.createElement('div');
        cardsCountText.className = 'cards-count';
        cardsCountText.textContent = `${cardCount} kort`;
        
        playerCard.appendChild(playerName);
        playerCard.appendChild(cardsDisplay);
        playerCard.appendChild(cardsCountText);
        
        sidebarContainer.appendChild(playerCard);
    });
}

function updateHandCount() {
    document.getElementById('hand-count').textContent = playerHand.length;
}

function updateCardsPlayed() {
    const cardsPlayed = currentPlayer.hand ? (5 - currentPlayer.hand.length) : 0; // Assuming 5 initial cards
    document.getElementById('cards-played').textContent = cardsPlayed;
}

function updateCurrentCardInfo(card, pyramidLevel) {
    document.getElementById('current-card-info').textContent = 
        `${card.value}${card.suit} (${pyramidLevel.sips} slurk${pyramidLevel.sips > 1 ? 'er' : ''})`;
}

function updateNextCardButton(isHost) {
    const nextCardBtn = document.getElementById('next-card-btn');
    if (isHost) {
        nextCardBtn.style.display = 'block';
        nextCardBtn.textContent = '⏭️ Neste kort (host)';
    } else {
        nextCardBtn.style.display = 'none';
    }
}

function initializeGamePyramid(pyramid) {
    const pyramidContainer = document.getElementById('game-pyramid');
    pyramidContainer.innerHTML = '';
    
    pyramid.forEach((level, levelIndex) => {
        const row = document.createElement('div');
        row.className = 'pyramid-row';
        row.style.order = levelIndex;
        
        for (let i = 0; i < level.cards; i++) {
            const card = document.createElement('div');
            card.className = 'card pyramid-card';
            card.dataset.level = levelIndex;
            card.dataset.sips = level.sips;
            card.dataset.position = getCardPosition(levelIndex, i, pyramid);
            
            // Add level number indicator instead of sip indicator
            const levelIndicator = document.createElement('div');
            levelIndicator.className = 'level-indicator';
            levelIndicator.textContent = `${levelIndex + 1}`;
            card.appendChild(levelIndicator);
            
            // Add card content (blank initially)
            const cardContent = document.createElement('div');
            cardContent.className = 'card-content';
            cardContent.textContent = '';
            card.appendChild(cardContent);
            
            row.appendChild(card);
        }
        
        pyramidContainer.appendChild(row);
    });
}

function getCardPosition(levelIndex, cardIndex, pyramid) {
    let position = 0;
    for (let i = 0; i < levelIndex; i++) {
        position += pyramid[i].cards;
    }
    return position + cardIndex;
}

function revealPyramidCard(card, position) {
    const pyramidCard = document.querySelector(`[data-position="${position}"]`);
    if (pyramidCard) {
        const cardContent = pyramidCard.querySelector('.card-content');
        cardContent.innerHTML = `${card.value}<br>${card.suit}`;
        pyramidCard.classList.add('revealed');
        
        // Add special styling for face cards
        if (['J', 'Q', 'K', 'A'].includes(card.value)) {
            pyramidCard.classList.add('face-card');
        }
    }
}

function showCardOnPyramid(card, position, stackCount = 1) {
    const pyramidCard = document.querySelector(`[data-position="${position}"]`);
    if (pyramidCard) {
        // Update or add stack indicator
        updateStackIndicator(pyramidCard, stackCount);
        
        // Create a stacked card element only for the first card
        if (stackCount === 1) {
            const stackedCard = document.createElement('div');
            stackedCard.className = 'stacked-card';
            stackedCard.innerHTML = `${card.value}<br>${card.suit}`;
            
            // Position it slightly offset
            stackedCard.style.position = 'absolute';
            stackedCard.style.top = '5px';
            stackedCard.style.left = '5px';
            stackedCard.style.width = '100%';
            stackedCard.style.height = '100%';
            stackedCard.style.background = '#ffffff';
            stackedCard.style.border = '2px solid #27ae60';
            stackedCard.style.borderRadius = '8px';
            stackedCard.style.display = 'flex';
            stackedCard.style.flexDirection = 'column';
            stackedCard.style.alignItems = 'center';
            stackedCard.style.justifyContent = 'center';
            stackedCard.style.fontSize = '0.8rem';
            stackedCard.style.fontWeight = 'bold';
            stackedCard.style.color = '#2c3e50';
            stackedCard.style.zIndex = '10';
            
            // Make pyramid card relative positioned
            pyramidCard.style.position = 'relative';
            pyramidCard.classList.add('has-played-card');
            
            // Add the stacked card
            pyramidCard.appendChild(stackedCard);
        }
    }
}

function updateStackIndicator(pyramidCard, stackCount) {
    // Remove existing indicator
    const existingIndicator = pyramidCard.querySelector('.card-stack-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Add new indicator if more than 1 card
    if (stackCount > 1) {
        const indicator = document.createElement('div');
        indicator.className = `card-stack-indicator stack-${Math.min(stackCount, 4)}`;
        indicator.textContent = stackCount;
        pyramidCard.appendChild(indicator);
    }
}

function updatePlayerHand() {
    const handContainer = document.getElementById('player-hand');
    handContainer.innerHTML = '';
    
    playerHand.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = 'hand-card';
        cardElement.dataset.cardId = card.id;
        cardElement.innerHTML = `${card.value}<br>${card.suit}`;
        
        cardElement.addEventListener('click', () => playCard(card.id));
        handContainer.appendChild(cardElement);
    });
}

function highlightPlayableCards(currentCard) {
    const handCards = document.querySelectorAll('.hand-card');
    handCards.forEach(cardElement => {
        const cardId = cardElement.dataset.cardId;
        const playerCard = playerHand.find(c => c.id === cardId);
        
        if (playerCard && playerCard.value === currentCard.value) {
            cardElement.classList.add('playable');
        } else {
            cardElement.classList.remove('playable');
        }
    });
}

function playCard(cardId) {
    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
    if (!cardElement.classList.contains('playable')) {
        showNotification('Dette kortet kan ikke spilles nå', 'error');
        return;
    }
    
    // Find all playable cards with the same value
    const playableCards = getPlayableCards();
    
    if (playableCards.length === 1) {
        // Only one card can be played, play it immediately
        playSelectedCards([cardId]);
    } else {
        // Multiple cards can be played, show selection interface
        showCardSelectionInterface(playableCards, cardId);
    }
}

function getPlayableCards() {
    const playableCards = [];
    const handCards = document.querySelectorAll('.hand-card.playable');
    handCards.forEach(cardElement => {
        const cardId = cardElement.dataset.cardId;
        const playerCard = playerHand.find(c => c.id === cardId);
        if (playerCard) {
            playableCards.push(playerCard);
        }
    });
    return playableCards;
}

function showCardSelectionInterface(playableCards, clickedCardId) {
    // Create selection modal
    const modal = document.createElement('div');
    modal.className = 'card-selection-modal';
    modal.innerHTML = `
        <div class="card-selection-content">
            <h3>Velg kort å spille</h3>
            <p>Du har ${playableCards.length} kort som kan spilles. Velg hvilke du vil spille:</p>
            <div class="selectable-cards" id="selectable-cards"></div>
            <div class="selection-actions">
                <button id="play-selected-btn" class="game-btn" disabled>Spill valgte kort</button>
                <button id="cancel-selection-btn" class="game-btn secondary">Avbryt</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const selectableCardsContainer = document.getElementById('selectable-cards');
    let selectedCards = [clickedCardId]; // Pre-select the clicked card
    
    playableCards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = 'selectable-card';
        cardElement.dataset.cardId = card.id;
        cardElement.innerHTML = `${card.value}<br>${card.suit}`;
        
        // Pre-select the clicked card
        if (card.id === clickedCardId) {
            cardElement.classList.add('selected');
        }
        
        cardElement.addEventListener('click', () => {
            if (selectedCards.includes(card.id)) {
                // Deselect
                selectedCards = selectedCards.filter(id => id !== card.id);
                cardElement.classList.remove('selected');
            } else {
                // Select
                selectedCards.push(card.id);
                cardElement.classList.add('selected');
            }
            updatePlayButtonState(selectedCards);
        });
        
        selectableCardsContainer.appendChild(cardElement);
    });
    
    updatePlayButtonState(selectedCards);
    
    document.getElementById('play-selected-btn').addEventListener('click', () => {
        if (selectedCards.length > 0) {
            playSelectedCards(selectedCards);
            document.body.removeChild(modal);
        }
    });
    
    document.getElementById('cancel-selection-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

function updatePlayButtonState(selectedCards) {
    const playBtn = document.getElementById('play-selected-btn');
    if (selectedCards.length > 0) {
        playBtn.disabled = false;
        playBtn.textContent = `Spill ${selectedCards.length} kort`;
    } else {
        playBtn.disabled = true;
        playBtn.textContent = 'Spill valgte kort';
    }
}

function playSelectedCards(cardIds) {
    // Send multiple cards to server
    socket.emit('playCard', { cardIds: cardIds });
    
    // Remove cards from hand
    cardIds.forEach(cardId => {
        const cardIndex = playerHand.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
            playerHand.splice(cardIndex, 1);
        }
    });
    
    updatePlayerHand();
    updateHandCount();
}

function showChooseDrinker(sips) {
    const chooseDrinker = document.getElementById('choose-drinker');
    const message = document.getElementById('choose-message');
    const options = document.getElementById('drinker-options');
    
    message.textContent = `Velg hvem som skal drikke ${sips} slurk${sips > 1 ? 'er' : ''}:`;
    options.innerHTML = '';
    
    // Use the stored players data
    allPlayers.forEach(player => {
        if (player.id !== currentPlayer.id) { // Exclude current player
            const button = document.createElement('button');
            button.className = 'drinker-btn';
            button.textContent = player.name;
            button.addEventListener('click', () => {
                assignDrinks(player.id, sips); // Use player ID
            });
            options.appendChild(button);
        }
    });
    
    chooseDrinker.style.display = 'block';
}

function assignDrinks(targetPlayerId, sips) {
    socket.emit('assignDrinks', { 
        targetPlayerId: targetPlayerId,
        sips: sips,
        cardPosition: 0 // This should track the actual position
    });
}

function hideChooseDrinker() {
    document.getElementById('choose-drinker').style.display = 'none';
}

function showDrinkConfirmation(sips, from) {
    const drinkConfirmation = document.getElementById('drink-confirmation');
    const message = document.getElementById('drink-message');
    
    message.textContent = `${from} ga deg ${sips} slurk${sips > 1 ? 'er' : ''}! Klikk for hver slurk du tar.`;
    drinkConfirmation.style.display = 'block';
    
    updateDrinkProgress(0, sips);
}

function confirmDrink() {
    if (pendingDrinkConfirmation) {
        socket.emit('confirmDrink', { confirmationId: pendingDrinkConfirmation });
    }
}

function updateDrinkProgress(confirmed, total) {
    const progress = document.getElementById('drink-progress');
    progress.textContent = `${confirmed}/${total} slurker drukket`;
    
    if (confirmed >= total) {
        setTimeout(hideDrinkConfirmation, 1000);
    }
}

function hideDrinkConfirmation() {
    document.getElementById('drink-confirmation').style.display = 'none';
    pendingDrinkConfirmation = null;
}

// Bus Route Interface
function showBusRouteInterface() {
    // Hide player hand section
    document.querySelector('.player-hand-section').style.display = 'none';
    
    // Show bus route instructions
    const gameActions = document.querySelector('.game-actions');
    gameActions.innerHTML = `
        <div class="bus-route-interface">
            <h3>🚌 Bussruten!</h3>
            <p>Klikk på kortene i pyramiden for å gå oppover! Unngå bildekort (A, J, Q, K) for å komme deg til toppen!</p>
            <div id="bus-route-level">
                <strong>Nåværende nivå:</strong> <span id="current-bus-level">1</span>
            </div>
            <p><em>Klikk på et kort i nederste rad for å starte!</em></p>
        </div>
    `;
    
    // Make pyramid cards clickable for bus route
    makePyramidClickableForBusRoute();
    updateBusRouteLevel(0);
}

function makePyramidClickableForBusRoute() {
    const pyramidCards = document.querySelectorAll('.pyramid-card');
    
    pyramidCards.forEach(card => {
        const level = parseInt(card.dataset.level);
        
        // Remove any existing bus route click handlers
        card.classList.remove('clickable-bus-route');
        
        // Remove the old event listener by removing and re-adding the element
        // This is necessary because we don't have a reference to the original handler
        const newCard = card.cloneNode(true);
        card.parentNode.replaceChild(newCard, card);
        
        // Start with only bottom row clickable
        if (level === 0) {
            newCard.classList.add('clickable-bus-route');
            newCard.addEventListener('click', () => handleBusRouteCardClick(newCard));
        }
    });
}

function handleBusRouteCardClick(cardElement) {
    const level = parseInt(cardElement.dataset.level);
    const position = parseInt(cardElement.dataset.position);
    
    // Emit click to server
    socket.emit('clickBusRouteCard', { level, position });
}

function updateBusRouteLevel(level) {
    const pyramidLevels = [
        { cards: 5, sips: 1 },
        { cards: 4, sips: 2 },
        { cards: 3, sips: 4 },
        { cards: 2, sips: 6 },
        { cards: 1, sips: 8 }
    ];
    
    if (level >= pyramidLevels.length) {
        // Game completed
        return;
    }
    
    const currentLevelSpan = document.getElementById('current-bus-level');
    if (currentLevelSpan) {
        currentLevelSpan.textContent = `${level + 1}`;
    }
    
    // Update clickable cards - clear all existing handlers first
    const pyramidCards = document.querySelectorAll('.pyramid-card');
    pyramidCards.forEach(card => {
        const cardLevel = parseInt(card.dataset.level);
        card.classList.remove('clickable-bus-route');
        
        // Remove existing event listeners by cloning the node
        const newCard = card.cloneNode(true);
        card.parentNode.replaceChild(newCard, card);
        
        if (cardLevel === level) {
            newCard.classList.add('clickable-bus-route');
            newCard.addEventListener('click', () => handleBusRouteCardClick(newCard));
        }
    });
}

function drawBusRouteCard(level = 0) {
    // This function is now replaced by handleBusRouteCardClick
    // Keep for backwards compatibility but redirect to new system
    socket.emit('drawBusRouteCard', { level });
}

// Keep original pyramid initialization for rules display
function initializePyramid() {
    const pyramidContainer = document.getElementById('pyramid');
    if (!pyramidContainer) return;
    
    // Define pyramid structure: [number of cards, sips per card]
    const pyramidLevels = [
        { cards: 5, sips: 1 },
        { cards: 4, sips: 2 },
        { cards: 3, sips: 4 },
        { cards: 2, sips: 6 },
        { cards: 1, sips: 8 }
    ];
    
    pyramidLevels.forEach((level, levelIndex) => {
        const row = document.createElement('div');
        row.className = 'pyramid-row';
        row.style.order = levelIndex;
        
        for (let i = 0; i < level.cards; i++) {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.level = levelIndex;
            card.dataset.sips = level.sips;
            
            // Add sip indicator
            const sipIndicator = document.createElement('div');
            sipIndicator.className = 'sip-indicator';
            sipIndicator.textContent = `${level.sips} slurk${level.sips > 1 ? 'er' : ''}`;
            card.appendChild(sipIndicator);
            
            // Add card content (back of card initially)
            const cardContent = document.createElement('div');
            cardContent.textContent = '?';
            card.appendChild(cardContent);
            
            // Add click event for flipping cards (demo only)
            card.addEventListener('click', function() {
                flipCard(this);
            });
            
            row.appendChild(card);
        }
        
        pyramidContainer.appendChild(row);
    });
}

// Keep original card flipping for demo
function flipCard(card) {
    if (card.classList.contains('flipped')) {
        return; // Already flipped
    }
    
    card.classList.add('flipped');
    const cardContent = card.querySelector('div:not(.sip-indicator)');
    
    // Generate random card (simplified for demo)
    const suits = ['♠', '♣', '♥', '♦'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const randomSuit = suits[Math.floor(Math.random() * suits.length)];
    const randomValue = values[Math.floor(Math.random() * values.length)];
    
    cardContent.innerHTML = `${randomValue}<br>${randomSuit}`;
    
    // Add animation
    card.style.transform = 'rotateY(180deg)';
    setTimeout(() => {
        card.style.transform = 'rotateY(0deg)';
    }, 200);
    
    // Check if it's a face card (for Bussruta rules)
    if (['J', 'Q', 'K'].includes(randomValue)) {
        card.style.borderColor = '#e74c3c';
        card.style.boxShadow = '0 0 10px rgba(231, 76, 60, 0.5)';
        
        // Show alert for face card
        setTimeout(() => {
            const sips = card.dataset.sips;
            showNotification(`Bildekort! Drikk ${sips} slurk${sips > 1 ? 'er' : ''} og start på nytt!`, 'warning');
        }, 300);
    }
}

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    const colors = {
        info: '#3498db',
        success: '#27ae60',
        warning: '#f39c12',
        error: '#e74c3c'
    };
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: ${colors[type] || colors.info};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 1000;
        font-weight: bold;
        max-width: 300px;
        animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Add CSS for level indicators and stacked cards
const additionalCSS = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .level-indicator {
        position: absolute;
        top: -25px;
        background-color: #3498db;
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.8rem;
        font-weight: bold;
    }
    
    .pyramid-card.revealed {
        background: #fff;
        border-color: #3498db;
    }
    
    .pyramid-card.face-card {
        border-color: #e74c3c;
        background: #f8f9fa;
    }
    
    .pyramid-card.has-played-card {
        border-color: #27ae60;
        background: #d5f4e6;
    }
    
    .stacked-card {
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        animation: stackCard 0.3s ease;
    }
    
    @keyframes stackCard {
        from {
            transform: scale(0.8) rotate(-5deg);
            opacity: 0;
        }
        to {
            transform: scale(1) rotate(0deg);
            opacity: 1;
        }
    }
    
    .pyramid-card.clickable-bus-route {
        cursor: pointer;
        border-color: #f39c12;
        box-shadow: 0 0 10px rgba(243, 156, 18, 0.5);
    }
    
    .pyramid-card.clickable-bus-route:hover {
        transform: translateY(-3px);
        box-shadow: 0 4px 15px rgba(243, 156, 18, 0.7);
    }
`;

// Activity log functions
function updateActivityLog(activityLog) {
    const logContainer = document.getElementById('activity-log');
    if (!logContainer) return;
    
    logContainer.innerHTML = '';
    
    // Show last 10 entries
    const recentEntries = activityLog.slice(-10);
    
    recentEntries.forEach(entry => {
        const logEntry = document.createElement('div');
        logEntry.className = `activity-log-entry ${entry.type.replace('_', '-')}`;
        
        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        
        let message = '';
        switch (entry.type) {
            case 'card_played':
                message = `${entry.player} spilte ${entry.card.value}${entry.card.suit}`;
                break;
            case 'drink_assigned':
                message = `${entry.from} ga ${entry.sips} slurk${entry.sips > 1 ? 'er' : ''} til ${entry.to}`;
                break;
            case 'bus_route_face_card':
                message = `${entry.player} trakk ${entry.card.value}${entry.card.suit} - bildekort!`;
                break;
            case 'bus_route_success':
                message = `${entry.player} trakk ${entry.card.value}${entry.card.suit} - godt trukket!`;
                break;
            case 'bus_route_completed':
                message = `🎉 ${entry.player} fullførte bussruten!`;
                break;
            default:
                message = 'Ukjent hendelse';
        }
        
        logEntry.innerHTML = `
            ${message}
            <span class="timestamp">${timestamp}</span>
        `;
        
        logContainer.appendChild(logEntry);
    });
    
    // Scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
}

// Celebration modal functions
function showCelebrationModal() {
    const modal = document.getElementById('celebration-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeCelebrationModal() {
    const modal = document.getElementById('celebration-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

const style = document.createElement('style');
style.textContent = additionalCSS;
document.head.appendChild(style);