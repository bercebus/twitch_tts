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
    let espeakVoices = [];
    let client = null;
    let ttsQueue = [];
    let isSpeaking = false;
    let currentEngine = 'webspeech';
    let espeakVolume = 0.7;  // Default volume for eSpeak NG (0.0 to 1.0)

    // --- Espeak NG Fallback State ---
    let espeakTTS = null;
    let espeakReady = false;
    let espeakContext = null;
    let espeakPusher = null;

    // --- Initialize default volume values ---
    volumeInput.value = '70';
    volumeVal.textContent = '70';
    const volumeLinear = 0.7;
    espeakVolume = Math.pow(volumeLinear, 2);

    function PushAudioNode(context, start_callback, end_callback, buffer_size, volume) {
        this.context = context;
        this.start_callback = start_callback;
        this.end_callback = end_callback;
        this.buffer_size = buffer_size || 4096;
        this.volume = volume !== undefined ? volume : 1.0;
        this.samples_queue = [];
        this.scriptNode = context.createScriptProcessor(this.buffer_size, 1, 1);
        this.connected = false;
        this.sinks = [];
        this.startTime = 0;
        this.closed = false;
        console.log("PushAudioNode created, scriptNode:", this.scriptNode);
    }

    PushAudioNode.prototype.setVolume = function(v) {
        this.volume = v;
    };

    PushAudioNode.prototype.push = function(chunk) {
        if (this.closed) return;
        this.samples_queue.push(new Float32Array(chunk));
        if (!this.connected && this.sinks.length) {
            this._do_connect();
        }
    };

    PushAudioNode.prototype.close = function() {
        this.closed = true;
    };

    PushAudioNode.prototype.connect = function(dest) {
        this.sinks.push(dest);
        this._do_connect(); // Always connect, not just when queue has samples
    };

    PushAudioNode.prototype._do_connect = function() {
        if (this.connected) return;
        this.connected = true;
        console.log("PushAudioNode connecting", this.sinks.length, "sinks");
        for (var dest of this.sinks) {
            this.scriptNode.connect(dest);
        }
        this.scriptNode.onaudioprocess = this.handleEvent.bind(this);
    };

    PushAudioNode.prototype.disconnect = function() {
        this.scriptNode.onaudioprocess = null;
        this.scriptNode.disconnect();
        this.connected = false;
    };

    PushAudioNode.prototype.handleEvent = function(evt) {
        if (!this.startTime) {
            this.startTime = evt.playbackTime;
            console.log("HandleEvent, playbackTime:", evt.playbackTime);
            if (this.start_callback) this.start_callback();
        }

        var offset = 0;
        while (this.samples_queue.length && offset < evt.target.bufferSize) {
            var chunk = this.samples_queue[0];
            var to_copy = chunk.subarray(0, evt.target.bufferSize - offset);
            const outputData = evt.outputBuffer.getChannelData(0);
            for (let i = 0; i < to_copy.length; i++) {
                // Samples are already normalized (-1 to 1) from eSpeak
                outputData[offset + i] = to_copy[i] * this.volume;
            }
            offset += to_copy.length;
            chunk = chunk.subarray(to_copy.length);
            if (chunk.length) {
                this.samples_queue[0] = chunk;
            } else {
                this.samples_queue.shift();
            }
        }

        if (!this.samples_queue.length && this.closed) {
            console.log("All samples played, closing");
            if (this.end_callback) this.end_callback();
            this.disconnect();
        }
    };

    // --- UI Elements ---
    const engineInfo = document.getElementById('engine-info');
    const badgeWebspeech = document.getElementById('badge-webspeech');
    const badgeEspeak = document.getElementById('badge-espeak');
    const voiceSource = document.getElementById('voice-source');
    const volumeEngine = document.getElementById('volume-engine');
    const speedEngine = document.getElementById('speed-engine');

    // --- Initialize eSpeak NG WASM Fallback ---
    function initEspeakFallback() {
        if (!window.eSpeakNG) {
            console.warn("eSpeakNG no está cargado");
            updateEngineUI('webspeech');
            return;
        }
        espeakTTS = new eSpeakNG(
            "./vendor/espeakng/espeakng.worker.js",
            function () {
                console.log("eSpeak ready, listing voices...");
                espeakTTS.list_voices(function(result) {
                    console.log("Voices listed:", result.length);
                    espeakVoices = result.map(v => ({
                        identifier: v.identifier,
                        name: v.name,
                        languages: v.languages
                    }));
                    populateVoiceList();
                });
                espeakTTS.set_voice("es");
                espeakTTS.set_rate(175);
                espeakTTS.set_pitch(45);
                espeakReady = true;
                console.log("eSpeak NG WASM fallback listo");

                if (voices.length === 0) {
                    currentEngine = 'espeak';
                    updateEngineUI('espeak');
                }
            }
        );
    }

    function updateEngineUI(engine) {
        currentEngine = engine;
        if (engine === 'espeak') {
            engineInfo.textContent = 'eSpeak NG (Fallback)';
            badgeEspeak.classList.add('active');
            badgeWebspeech.classList.remove('active');
            voiceSource.textContent = '';
            volumeEngine.textContent = '';
            speedEngine.textContent = '(80-450)';
            speedInput.min = '80';
            speedInput.max = '450';
            speedInput.step = '1';
            speedInput.value = '175';
            speedVal.textContent = '175';
        } else {
            engineInfo.textContent = 'Web Speech API';
            badgeWebspeech.classList.add('active');
            badgeEspeak.classList.remove('active');
            voiceSource.textContent = '';
            volumeEngine.textContent = '';
            speedEngine.textContent = '';
            speedInput.min = '0.5';
            speedInput.max = '2.0';
            speedInput.step = '0.1';
            speedInput.value = '1.0';
            speedVal.textContent = '1.0';
        }
    }

    // --- Voice Initialization ---
    function populateVoiceList() {
        voices = window.speechSynthesis.getVoices();
        voiceSelect.innerHTML = '';

        if (espeakReady && espeakVoices.length > 0) {
            const hasWebSpeech = voices.length > 0;

            if (hasWebSpeech) {
                const optGroup = document.createElement('optgroup');
                optGroup.label = 'Web Speech API';
                voices.forEach((voice) => {
                    const option = document.createElement('option');
                    option.textContent = `${voice.name} (${voice.lang})`;
                    option.value = `webspeech:${voice.voiceURI}`;
                    optGroup.appendChild(option);
                });
                voiceSelect.appendChild(optGroup);
            }

            const espeakGroup = document.createElement('optgroup');
            espeakGroup.label = 'eSpeak NG';
            espeakVoices.forEach((voice) => {
                const langs = voice.languages.map(l => l.name).join(', ');
                const option = document.createElement('option');
                option.textContent = `${voice.name} (${langs})`;
                option.value = `espeak:${voice.identifier}`;
                espeakGroup.appendChild(option);
            });
            voiceSelect.appendChild(espeakGroup);

            const defaultEs = Array.from(voiceSelect.options).find(o => 
                o.value.includes('espeak') && o.textContent.toLowerCase().includes('spanish')
            );
            if (defaultEs) {
                voiceSelect.value = defaultEs.value;
            }
        } else if (voices.length > 0) {
            voices.forEach((voice) => {
                const option = document.createElement('option');
                option.textContent = `${voice.name} (${voice.lang})`;
                option.value = `webspeech:${voice.voiceURI}`;
                if (voice.default) option.selected = true;
                voiceSelect.appendChild(option);
            });

            const esOptions = Array.from(voiceSelect.options).filter(opt => 
                opt.textContent.toLowerCase().includes('(es')
            );
            if (esOptions.length > 0) {
                voiceSelect.value = esOptions[0].value;
            }
        }
    }

    populateVoiceList();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }

    initEspeakFallback();

    // --- UI Listeners ---
    volumeInput.addEventListener('input', (e) => {
        volumeVal.textContent = e.target.value;
        const volumeLinear = parseFloat(e.target.value) / 100;
        espeakVolume = Math.pow(volumeLinear, 2);
        if (espeakPusher) {
            espeakPusher.setVolume(espeakVolume);
        }
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
    async function playNextInQueue() {
        if (ttsQueue.length === 0) {
            isSpeaking = false;
            return;
        }

        isSpeaking = true;
        const item = ttsQueue.shift();

        if (isMuted) {
            playNextInQueue();
            return;
        }

        const selectedValue = voiceSelect.value;

if (selectedValue && selectedValue.startsWith('espeak:')) {
            const voiceId = selectedValue.replace('espeak:', '');

            if (espeakContext) {
                espeakContext.close().catch(() => {});
            }
            espeakContext = new (window.AudioContext || window.webkitAudioContext)();

            if (espeakContext.state === 'suspended') {
                console.log("AudioContext suspended, resuming...");
                await espeakContext.resume();
            }

            if (espeakPusher) {
                espeakPusher.disconnect();
            }

            const gainNode = espeakContext.createGain();
            gainNode.gain.value = espeakVolume;
            gainNode.connect(espeakContext.destination);

            const pusher = new PushAudioNode(
                espeakContext,
                function() {
                    console.log("PushAudioNode started");
                },
                function() {
                    console.log("PushAudioNode end callback");
                    setTimeout(playNextInQueue, 300);
                },
                4096,
                espeakVolume
            );

            console.log("Connecting pusher through gain to destination");
            pusher.connect(gainNode);
            espeakPusher = pusher;

            const rate = parseInt(speedInput.value);
            console.log("Setting rate:", rate);
            espeakTTS.set_rate(rate);
            console.log("Setting voice:", voiceId);
            espeakTTS.set_voice(voiceId);

            const textToSpeak = item.text;
            console.log("Synthesizing:", textToSpeak);

            espeakTTS.synthesize(textToSpeak, function(samplesBuffer) {
                console.log("Synthesize callback, samplesBuffer:", samplesBuffer);
                if (!samplesBuffer) {
                    console.log("No samplesBuffer");
                    if (pusher) pusher.close();
                    setTimeout(playNextInQueue, 300);
                    return;
                }
                const samples = new Float32Array(samplesBuffer);
                console.log("Samples length:", samples.length);
                if (samples.length === 0) {
                    if (pusher) pusher.close();
                    setTimeout(playNextInQueue, 300);
                    return;
                }
                if (pusher) {
                    console.log("Pushing samples to pusher");
                    pusher.push(samples);
                }
            });
            return;
        }

        // Use Web Speech API
        const utterance = new SpeechSynthesisUtterance(item.text);

        if (selectedValue && selectedValue.startsWith('webspeech:')) {
            const voiceURI = selectedValue.replace('webspeech:', '');
            const selectedVoice = voices.find(v => v.voiceURI === voiceURI);
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }
        }

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
        connectionStatus.textContent = 'Conectando...';
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
                connectionStatus.textContent = `Conectado a #${channel}`;
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
            connectionStatus.textContent = `Desconectado: ${reason}`;
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
        connectionStatus.textContent = 'Desconectado';
        connectionStatus.className = '';
        addLogMessage("Sistema", "Desconectado.");
    }

    function resetUI() {
        connectBtn.classList.remove('hidden');
        disconnectBtn.classList.add('hidden');
        channelInput.disabled = false;
    }
});
