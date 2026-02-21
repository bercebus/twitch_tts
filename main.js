document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const voiceSelect = document.getElementById('voice');
    const volumeInput = document.getElementById('volume');
    const volumeVal = document.getElementById('volume-val');
    const speedInput = document.getElementById('speed');
    const speedVal = document.getElementById('speed-val');
    const muteTtsBtn = document.getElementById('mute-tts-btn');
    const form = document.getElementById('tts-form');

    // Config Inputs
    const channelInput = document.getElementById('channel');
    const ignoredUsersInput = document.getElementById('ignored-users');
    const ignoreModsInput = document.getElementById('ignore-mods');
    const ignoreVipsInput = document.getElementById('ignore-vips');
    const ignoreBroadcasterInput = document.getElementById('ignore-broadcaster');
    const subOnlyInput = document.getElementById('subscribers-only');

    // UI Elements
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const resultSection = document.getElementById('result-section');
    const connectionStatus = document.getElementById('connection-status');
    const messageLog = document.getElementById('message-log');
    const testTtsBtn = document.getElementById('test-tts-btn');

    // --- State ---
    let voices = [];
    let client = null;
    let ttsQueue = [];
    let isSpeaking = false;

    // --- Voice Initialization ---
    function populateVoiceList() {
        voices = window.speechSynthesis.getVoices();

        if (voices.length === 0) {
            setTimeout(populateVoiceList, 100);
            return;
        }

        voiceSelect.innerHTML = '';

        voices.forEach((voice) => {
            const option = document.createElement('option');
            option.textContent = `${voice.name} (${voice.lang})`;
            option.value = voice.voiceURI;

            if (voice.default) {
                option.selected = true;
            }

            voiceSelect.appendChild(option);
        });

        // Override default and prefer a Spanish voice if available
        const esOptions = Array.from(voiceSelect.options).filter(opt => opt.textContent.toLowerCase().includes('(es'));
        if (esOptions.length > 0) {
            // Try to find a standard Spanish voice first (not necessarily latin american, or whatever is first)
            voiceSelect.value = esOptions[0].value;
        }
    }

    populateVoiceList();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }

    // --- UI Listeners ---
    volumeInput.addEventListener('input', (e) => {
        volumeVal.textContent = e.target.value;
    });

    // Speed slider update
    speedInput.addEventListener('input', (e) => {
        speedVal.textContent = e.target.value;
    });

    // Mute button logic
    let isMuted = false;
    muteTtsBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        if (isMuted) {
            muteTtsBtn.innerHTML = '🔇<br>Muted';
            muteTtsBtn.classList.add('btn-active');
        } else {
            muteTtsBtn.innerHTML = '🔊<br>Unmuted';
            muteTtsBtn.classList.remove('btn-active');
        }
    });

    testTtsBtn.addEventListener('click', () => {
        addToQueue("Prueba de sonido exitosa", "Sistema");
    });

    // --- TTS Queue System ---
    function playNextInQueue() {
        if (ttsQueue.length === 0) {
            isSpeaking = false;
            return;
        }

        isSpeaking = true;
        const item = ttsQueue.shift();

        // If muted, we skip the audio part but continue to the next item immediately
        if (isMuted) {
            playNextInQueue();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(item.text);

        const selectedVoiceURI = voiceSelect.value;
        if (selectedVoiceURI && voices.length > 0) {
            const selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }
        }

        // Apply a quadratic curve for a more natural volume perception
        const volumeLinear = parseFloat(volumeInput.value) / 100;
        const currentVolume = Math.pow(volumeLinear, 2);

        const currentRate = parseFloat(speedInput.value);

        utterance.volume = currentVolume;
        utterance.rate = currentRate;

        utterance.onend = () => {
            setTimeout(playNextInQueue, 300);
        };

        utterance.onerror = (e) => {
            console.error('TTS Error:', e);
            playNextInQueue();
        };

        window.speechSynthesis.speak(utterance);
    }

    function addToQueue(message, user) {
        // Log the message immediately so it appears even if muted
        addLogMessage(user, message);

        const textToSpeak = `${user} dice: ${message}`;
        ttsQueue.push({
            text: textToSpeak,
            user: user,
            originalMsg: message
        });

        if (!isSpeaking) {
            playNextInQueue();
        }
    }

    function addLogMessage(user, message) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'log-entry';
        msgDiv.innerHTML = `<strong>${user}:</strong> <span>${message}</span>`;

        messageLog.prepend(msgDiv); // Add to top

        // Keep max 20 messages
        if (messageLog.children.length > 20) {
            messageLog.removeChild(messageLog.lastChild);
        }
    }

    // --- Twitch TMI Logic ---
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        connectToTwitch();
    });

    disconnectBtn.addEventListener('click', () => {
        disconnectFromTwitch();
    });

    function connectToTwitch() {
        const channel = channelInput.value.trim();
        if (!channel) return;

        // Disconnect existing
        if (client) {
            client.disconnect();
        }

        // Show UI changes
        connectBtn.classList.add('hidden');
        disconnectBtn.classList.remove('hidden');

        channelInput.disabled = true;
        connectionStatus.textContent = 'Connecting...';
        connectionStatus.className = 'text-accent';

        client = new tmi.Client({
            connection: {
                reconnect: true,
                secure: true
            },
            channels: [channel]
        });

        client.connect()
            .then(() => {
                connectionStatus.textContent = `Connected to #${channel}`;
                connectionStatus.className = 'text-success';
                addLogMessage("Sistema", `Conectado al canal: ${channel}`);
            })
            .catch((error) => {
                connectionStatus.textContent = `Error: ${error}`;
                connectionStatus.className = 'text-error';
                resetUI();
            });

        client.on('message', (channel, tags, message, self) => {
            if (self) return;

            // Dynamically read settings so they can be changed mid-stream
            const ignoreMods = ignoreModsInput.checked;
            const ignoreVips = ignoreVipsInput.checked;
            const ignoreBroadcaster = ignoreBroadcasterInput.checked;
            const subOnly = subOnlyInput.checked;
            const ignoredUsersRaw = ignoredUsersInput.value;
            const ignoredUsers = ignoredUsersRaw.split(',').map(u => u.trim().toLowerCase()).filter(u => u.length > 0);

            const username = tags.username.toLowerCase();
            const displayName = tags['display-name'] || tags.username;

            // Ignored Users check
            if (ignoredUsers.includes(username)) return;

            // Mod/VIP/Broadcaster specific checks
            const isMod = tags.mod === true;
            const isBroadcaster = tags.badges && tags.badges.broadcaster === '1';
            const isVIP = tags.vip === true;

            if (ignoreMods && isMod) return;
            if (ignoreVips && isVIP) return;
            if (ignoreBroadcaster && isBroadcaster) return;

            // Sub Only check
            let isAllowed = true;
            if (subOnly) {
                const isSub = tags.subscriber === true;
                isAllowed = isSub || isVIP || isMod || isBroadcaster;
            }

            if (!isAllowed) return;

            const textToRead = message.trim();
            if (textToRead.length > 0) {
                addToQueue(textToRead, displayName);
            }
        });

        client.on('disconnected', (reason) => {
            connectionStatus.textContent = `Disconnected: ${reason}`;
            connectionStatus.className = 'text-error';
            resetUI();
        });
    }

    function disconnectFromTwitch() {
        if (client) {
            client.disconnect();
            client = null;
        }
        resetUI();
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.className = '';
        addLogMessage("Sistema", "Desconectado.");
    }

    function resetUI() {
        connectBtn.classList.remove('hidden');
        disconnectBtn.classList.add('hidden');
        channelInput.disabled = false;
    }
});
