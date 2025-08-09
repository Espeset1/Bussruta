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
        updateGameStatus('Spillet startet!');
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
    
    socket.on('cardPlayed', ({ playerId, playerName, card, position, sips }) => {
        showCardOnPyramid(card, position);
        showNotification(`${playerName} spilte ${card.value}${card.suit}!`, 'success');
        updateHandCount();
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
    
    // Show start button if we have enough players and this is the room creator
    const startBtn = document.getElementById('start-game-btn');
    if (players.length >= 2 && players[0].id === currentPlayer.id) {
        startBtn.style.display = 'block';
    } else {
        startBtn.style.display = 'none';
    }
}

function updateGameStatus(status) {
    document.getElementById('game-status').textContent = status;
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
            
            // Add sip indicator
            const sipIndicator = document.createElement('div');
            sipIndicator.className = 'sip-indicator';
            sipIndicator.textContent = `${level.sips} slurk${level.sips > 1 ? 'er' : ''}`;
            card.appendChild(sipIndicator);
            
            // Add card content (back of card initially)
            const cardContent = document.createElement('div');
            cardContent.className = 'card-content';
            cardContent.textContent = '?';
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

function showCardOnPyramid(card, position) {
    const pyramidCard = document.querySelector(`[data-position="${position}"]`);
    if (pyramidCard) {
        pyramidCard.classList.add('has-played-card');
        
        // Add played card indicator
        const playedIndicator = document.createElement('div');
        playedIndicator.className = 'played-card-indicator';
        playedIndicator.textContent = '✓';
        pyramidCard.appendChild(playedIndicator);
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
    
    socket.emit('playCard', { cardId });
    
    // Remove card from hand
    const cardIndex = playerHand.findIndex(c => c.id === cardId);
    if (cardIndex !== -1) {
        playerHand.splice(cardIndex, 1);
        updatePlayerHand();
        updateHandCount();
    }
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

// Add CSS for animations and additional styles
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
    
    .pyramid-card.revealed {
        background: #fff;
        border-color: #3498db;
    }
    
    .pyramid-card.face-card {
        border-color: #e74c3c;
        background: #f8f9fa;
    }
    
    .pyramid-card.has-played-card {
        position: relative;
        border-color: #27ae60;
        background: #d5f4e6;
    }
    
    .played-card-indicator {
        position: absolute;
        top: 5px;
        right: 5px;
        background: #27ae60;
        color: white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
    }
`;

const style = document.createElement('style');
style.textContent = additionalCSS;
document.head.appendChild(style);