const puppeteer = require('puppeteer');
const { Telegraf } = require('telegraf');

// Configuration via variables d'environnement Render
const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;

// Mémoire de structure pour le suivi SMC
let marketStructure = {
    'PAIN400': { high: 0, low: 0, lastSweep: null, state: 'SCANNING' },
    'GAIN400': { high: 0, low: 0, lastSweep: null, state: 'SCANNING' }
};

async function startTerminal() {
    console.log("🚀 Terminal SMC Actif : Connexion au flux Weltrade...");

    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    // Accès au graphique direct
    await page.goto('https://www.tradingview.com/chart/?symbol=WELTRADE:PAIN400', { 
        waitUntil: 'networkidle2',
        timeout: 60000 
    });

    // Boucle d'analyse en temps réel (toutes les 5 secondes)
    setInterval(async () => {
        try {
            const currentPrice = await page.evaluate(() => {
                const priceEl = document.querySelector('.last-K_uL78S-');
                return priceEl ? parseFloat(priceEl.innerText.replace(',', '')) : null;
            });

            if (currentPrice) {
                processSMCLogic('PAIN400', currentPrice);
                // Note: Tu peux dupliquer cette logique pour GAIN400 en ouvrant un deuxième onglet si nécessaire
            }
        } catch (error) {
            console.error("Erreur de lecture flux :", error.message);
        }
    }, 5000);
}

function processSMCLogic(pair, price) {
    const data = marketStructure[pair];

    // 1. Initialisation de la structure si vide
    if (data.high === 0) {
        data.high = price + 5; 
        data.low = price - 5;
        console.log(`[${pair}] Structure initialisée. High: ${data.high} | Low: ${data.low}`);
        return;
    }

    // 2. Détection du SWEEP (Prise de liquidité au-dessus du High)
    if (price > data.high && data.state === 'SCANNING') {
        data.state = 'SWEEP_DETECTED';
        data.lastSweep = price;
        console.log(`[${pair}] ⚠️ SWEEP détecté à ${price}. Attente du BOS M5...`);
    }

    // 3. Détection du BOS (Break of Structure - Confirmation du retournement)
    // On considère un BOS si le prix repasse 2 points sous le niveau du sweep
    if (data.state === 'SWEEP_DETECTED' && price < data.high - 1.5) {
        sendProductionSignal(pair, 'SELL', price);
        
        // Reset de la structure après le signal pour chercher le prochain setup
        data.state = 'SCANNING';
        data.high = price + 10; 
        data.low = price - 10;
    }
}

async function sendProductionSignal(market, action, price) {
    const message = `
🚨 **SIGNAL SMC TEMPS RÉEL** 🚨
━━━━━━━━━━━━━━━━━━
📈 **Marché :** ${market}
⚡ **Action :** ${action === 'BUY' ? 'ACHAT 🟢' : 'VENTE 🔴'}
🎯 **Prix d'Entrée :** ${price}
⏳ **Stratégie :** Sweep M20 + BOS M5
━━━━━━━━━━━━━━━━━━
✅ *Signal généré automatiquement par ton Terminal.*
    `;

    try {
        await bot.telegram.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown' });
        console.log(`✅ Signal envoyé pour ${market}`);
    } catch (err) {
        console.error("Erreur envoi Telegram :", err);
    }
}

startTerminal();
