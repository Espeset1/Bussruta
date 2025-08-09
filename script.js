// Bussruta Game JavaScript

document.addEventListener('DOMContentLoaded', function() {
    initializePyramid();
    initializeShareButtons();
    initializeSmoothScrolling();
});

// Initialize the pyramid visualization
function initializePyramid() {
    const pyramidContainer = document.getElementById('pyramid');
    
    // Define pyramid structure: [number of cards, sips per card]
    const pyramidLevels = [
        { cards: 5, sips: 1 },
        { cards: 4, sips: 2 },
        { cards: 3, sips: 3 },
        { cards: 2, sips: 4 },
        { cards: 1, sips: 5 }
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
            
            // Add click event for flipping cards
            card.addEventListener('click', function() {
                flipCard(this);
            });
            
            row.appendChild(card);
        }
        
        pyramidContainer.appendChild(row);
    });
}

// Card flipping functionality
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

// Reset pyramid function
function resetPyramid() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.classList.remove('flipped');
        card.style.transform = '';
        card.style.borderColor = '';
        card.style.boxShadow = '';
        const cardContent = card.querySelector('div:not(.sip-indicator)');
        cardContent.textContent = '?';
    });
}

// Show notification function
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: ${type === 'warning' ? '#f39c12' : '#3498db'};
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
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add CSS for notifications
const notificationCSS = `
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
`;

const style = document.createElement('style');
style.textContent = notificationCSS;
document.head.appendChild(style);

// Initialize share buttons
function initializeShareButtons() {
    const shareButtons = document.querySelectorAll('.share-btn');
    
    shareButtons.forEach(button => {
        button.addEventListener('click', function() {
            const platform = this.classList.contains('facebook') ? 'facebook' :
                           this.classList.contains('whatsapp') ? 'whatsapp' : 'email';
            
            shareGame(platform);
        });
    });
}

// Share functionality
function shareGame(platform) {
    const url = window.location.href;
    const title = 'Bussruta - Drikkelek';
    const description = 'Sjekk ut denne morsomme drikkeleken!';
    
    switch(platform) {
        case 'facebook':
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
            break;
        case 'whatsapp':
            window.open(`https://wa.me/?text=${encodeURIComponent(title + ' - ' + url)}`, '_blank');
            break;
        case 'email':
            window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(description + '\n\n' + url)}`;
            break;
    }
}

// Smooth scrolling for navigation
function initializeSmoothScrolling() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Add reset button to pyramid section
document.addEventListener('DOMContentLoaded', function() {
    const pyramidSection = document.querySelector('.pyramid-section');
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset Pyramide';
    resetButton.className = 'share-btn';
    resetButton.style.cssText = `
        background-color: #95a5a6;
        color: white;
        margin-top: 1rem;
        padding: 0.8rem 1.5rem;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        transition: background-color 0.3s ease;
    `;
    
    resetButton.addEventListener('click', resetPyramid);
    resetButton.addEventListener('mouseenter', function() {
        this.style.backgroundColor = '#7f8c8d';
    });
    resetButton.addEventListener('mouseleave', function() {
        this.style.backgroundColor = '#95a5a6';
    });
    
    pyramidSection.appendChild(resetButton);
});

// Add game timer functionality (optional)
let gameTimer;
let gameStartTime;

function startGameTimer() {
    gameStartTime = new Date();
    gameTimer = setInterval(updateGameTimer, 1000);
}

function updateGameTimer() {
    const currentTime = new Date();
    const elapsedTime = Math.floor((currentTime - gameStartTime) / 1000);
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    
    // Update timer display if element exists
    const timerElement = document.getElementById('game-timer');
    if (timerElement) {
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function stopGameTimer() {
    if (gameTimer) {
        clearInterval(gameTimer);
        gameTimer = null;
    }
}