class LiveTranslator {
    constructor() {
        this.isRecording = false;
        this.recognition = null;
        this.recordButton = document.getElementById('recordButton');
        this.spanishText = document.getElementById('spanishText');
        this.englishText = document.getElementById('englishText');
        this.status = document.getElementById('status');
        this.cameraVideo = document.getElementById('cameraVideo');
        this.targetLanguageSelect = document.getElementById('targetLanguage');
        this.lastSpokenText = '';
        this.isSpeaking = false;
        this.isWaitingToSpeak = false;
        this.speechQueue = [];
        this.silenceTimer = null;
        this.lastSpeechTime = 0;
        this.currentTargetLanguage = 'es-ES';
        this.currentLanguageName = 'Español';

        this.initializeCamera();
        this.initializeSpeechRecognition();
        this.initializeEventListeners();
        this.initializeLanguageSupport();

        // Configurar idioma inicial
        this.updateLanguageDisplay();
    }

    async initializeCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: {
                    echoCancellation: false, // Necesario para Speech-to-Speech
                    noiseSuppression: false, // Mantener audio natural para clonación
                    autoGainControl: true,
                    sampleRate: 48000, // Alta calidad para ElevenLabs
                    channelCount: 1,
                    volume: 1.0,
                    googEchoCancellation: false,
                    googAutoGainControl: true,
                    googNoiseSuppression: false,
                    googHighpassFilter: false,
                    googTypingNoiseDetection: false
                }
            });
            this.cameraVideo.srcObject = stream;
            this.mediaStream = stream; // Guardar referencia para Speech-to-Speech

            // Configurar el audio context para máxima sensibilidad y calidad
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.3;
            this.mediaStreamSource.connect(this.analyser);

        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            this.status.textContent = 'Error: No se puede acceder a la cámara';
        }
    }



    initializeLanguageSupport() {
        // ElevenLabs API configuration
        this.elevenLabsApiKey = 'sk_8ef5b8c0a3f5743ee01671aaab8062a163b61508f4ba70f3';

        // Cache de audio para reducir llamadas a API
        this.audioCache = new Map();
        this.lastTranslation = '';

        // Verificar si la API key está correcta
        console.log('ElevenLabs API Key configurada');

        // Voces específicas y optimizadas por idioma
        this.languageConfig = {
            'es-ES': { 
                name: 'Español', 
                voiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella (mujer, joven)
                model: 'eleven_turbo_v2_5'
            },
            'en-US': { 
                name: 'Inglés', 
                voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam (hombre, profundo)
                model: 'eleven_turbo_v2_5'
            },
            'zh-CN': { 
                name: 'Chino', 
                voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel (clara, multiidioma)
                model: 'eleven_multilingual_v2'
            },
            'fr-FR': { 
                name: 'Francés', 
                voiceId: 'AZnzlk1XvdvUeBnXmlld', // Domi (cálida, francesa)
                model: 'eleven_multilingual_v2'
            },
            'de-DE': { 
                name: 'Alemán', 
                voiceId: 'ErXwobaYiN019PkySvjV', // Antoni (masculina, alemana)
                model: 'eleven_multilingual_v2'
            },
            'it-IT': { 
                name: 'Italiano', 
                voiceId: 'MF3mGyEYCl7XYWbV9V6O', // Elli (femenina, italiana)
                model: 'eleven_multilingual_v2'
            },
            'pt-BR': { 
                name: 'Portugués', 
                voiceId: 'TxGEqnHWrfWFTfGW9XjX', // Josh (masculina, brasileña)
                model: 'eleven_multilingual_v2'
            },
            'ja-JP': { 
                name: 'Japonés', 
                voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel (multiidioma)
                model: 'eleven_multilingual_v2'
            },
            'ko-KR': { 
                name: 'Coreano', 
                voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel (multiidioma)
                model: 'eleven_multilingual_v2'
            },
            'ru-RU': { 
                name: 'Ruso', 
                voiceId: 'onwK4e9ZLuTAKqWW03F9', // Daniel (masculina, rusa)
                model: 'eleven_multilingual_v2'
            },
            'ar-SA': { 
                name: 'Árabe', 
                voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel (multiidioma)
                model: 'eleven_multilingual_v2'
            }
        };
    }



    initializeSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.status.textContent = 'Tu navegador no soporta reconocimiento de voz';
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();

        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'es-ES';
        this.recognition.maxAlternatives = 1;

        // Configuración optimizada para mejor detección
        if (this.recognition.serviceURI) {
            this.recognition.serviceURI = null;
        }

        this.recognition.onstart = () => {
            this.spanishText.classList.add('listening');
        };

        this.recognition.onresult = (event) => {
            // Solo procesar si no estamos hablando o esperando hablar
            if (this.isSpeaking || this.isWaitingToSpeak) {
                return;
            }

            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;

                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            const currentText = finalTranscript || interimTranscript;
            if (currentText.trim()) {
                this.spanishText.textContent = currentText;
                this.lastSpeechTime = Date.now();



                // Traducir inmediatamente con texto final
                if (finalTranscript.trim()) {
                    if (this.silenceTimer) {
                        clearTimeout(this.silenceTimer);
                    }
                    this.pauseListeningAndTranslate(finalTranscript);
                } else if (currentText.trim().length > 1) {
                    // Traducción ultra-rápida e instantánea
                if (this.silenceTimer) {
                    clearTimeout(this.silenceTimer);
                }

                // Traducción instantánea con menos palabras requeridas
                const minWords = 2; // Solo 2 palabras mínimas
                const wordCount = currentText.trim().split(' ').length;
                let waitTime = 300; // 300ms base ultra-rápido

                // Tiempo de espera muy corto para traducción instantánea
                if (wordCount >= minWords) {
                    waitTime = Math.min(800, 300 + (wordCount * 20)); // Máximo 800ms
                } else {
                    waitTime = 500; // 500ms para frases cortas
                }

                this.silenceTimer = setTimeout(() => {
                    if (!this.isSpeaking && currentText.trim() && wordCount >= minWords) {
                        this.pauseListeningAndTranslate(currentText);
                    }
                }, waitTime);
                }
            }
        };

        this.recognition.onerror = (event) => {
            // Manejar errores sin detener el sistema
            if (event.error === 'no-speech' || event.error === 'audio-capture') {
                // Reintentar con configuración más sensible
                if (this.isRecording && !this.isSpeaking) {
                    setTimeout(() => this.restartRecognition(), 500);
                }
                return;
            }

            if (event.error !== 'aborted' && event.error !== 'network') {
                console.error('Error de reconocimiento:', event.error);
                this.status.textContent = `Error: ${event.error}`;
            }
        };

        this.recognition.onend = () => {
            if (this.isRecording && !this.isSpeaking && !this.isWaitingToSpeak) {
                setTimeout(() => this.restartRecognition(), 100);
            }
        };
    }

    restartRecognition() {
        if (this.isRecording && !this.isSpeaking && !this.isWaitingToSpeak) {
            try {
                this.recognition.start();
            } catch (error) {
                // Reintentar después de un breve delay
                setTimeout(() => {
                    if (this.isRecording && !this.isSpeaking && !this.isWaitingToSpeak) {
                        try {
                            this.recognition.start();
                        } catch (e) {
                            console.error('Error persistente:', e);
                        }
                    }
                }, 500);
            }
        }
    }

    async pauseListeningAndTranslate(text) {
        if (this.isSpeaking || this.isWaitingToSpeak) return;

        // Pausar el reconocimiento
        this.isWaitingToSpeak = true;
        this.recognition.stop();

        // Para Speech-to-Speech, necesitamos el audio original y la traducción
        this.lastSpokenSpanishText = text;
        await this.translateText(text);
    }

    async translateText(text) {
        try {
            const targetLang = this.currentTargetLanguage;
            const langPair = `es|${targetLang.split('-')[0]}`;

            // Usar múltiples APIs de traducción para mejor precisión
            let translatedText = '';

            try {
                // API primaria
                const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`);
                const data = await response.json();

                if (data.responseStatus === 200) {
                    translatedText = data.responseData.translatedText;
                }
            } catch (apiError) {
                console.log('API primaria falló, usando respaldo...');
            }

            // Si falla, usar traducción local
            if (!translatedText) {
                translatedText = await this.simpleTranslateToLanguage(text, targetLang);
            }

            // Animación de traducción
            this.englishText.classList.add('translating');
            this.englishText.textContent = translatedText;

            setTimeout(() => {
                this.englishText.classList.remove('translating');
            }, 1500);

            // Hablar en el idioma seleccionado
            await this.speakTranslation(translatedText, text);

        } catch (error) {
            console.error('Error de traducción:', error);
            const translated = await this.simpleTranslateToLanguage(text, this.currentTargetLanguage);
            this.englishText.textContent = translated;
            await this.speakTranslation(translated, text);
        }
    }

    async speakTranslation(translatedText, originalText) {
        if (!translatedText.trim() || this.isSpeaking) return;

        this.isSpeaking = true;

        try {
            // Usar ElevenLabs para voces ultra-realistas
            await this.speakWithElevenLabs(translatedText);
        } catch (error) {
            console.error('Error al hablar:', error);
        }

        // Reanudar escucha inmediatamente después de hablar
        this.isSpeaking = false;
        this.isWaitingToSpeak = false;

        if (this.isRecording) {
            setTimeout(() => this.restartRecognition(), 50); // Ultra-rápido: 50ms
        }
    }

    updateLanguageDisplay() {
        if (!this.isRecording) {
            this.englishText.textContent = `Traducirá a ${this.currentLanguageName}...`;
        }
    }





    async speakWithElevenLabs(text) {
        return new Promise(async (resolve) => {
            try {
                const voiceConfig = this.languageConfig[this.currentTargetLanguage];

                if (!voiceConfig) {
                    console.error('Configuración de voz no encontrada para:', this.currentTargetLanguage);
                    // Usar fallback de navegador
                    this.speakWithBrowserTTS(text);
                    resolve();
                    return;
                }

                // Crear clave de cache única
                const cacheKey = `${this.currentTargetLanguage}-${text.toLowerCase().trim()}`;

                // Verificar cache para evitar llamadas duplicadas
                if (this.audioCache.has(cacheKey)) {
                    console.log('Usando audio en cache');
                    const cachedAudioUrl = this.audioCache.get(cacheKey);
                    const audio = new Audio(cachedAudioUrl);

                    audio.onended = () => resolve();
                    audio.onerror = () => {
                        console.log('Error en cache, usando fallback');
                        this.speakWithBrowserTTS(text);
                        resolve();
                    };
                    
                    try {
                        await audio.play();
                    } catch (playError) {
                        console.log('Error reproduciendo cache, usando fallback');
                        this.speakWithBrowserTTS(text);
                        resolve();
                    }
                    return;
                }

                // Evitar repetir la misma traducción
                if (text === this.lastTranslation) {
                    resolve();
                    return;
                }
                this.lastTranslation = text;

                console.log(`Usando ElevenLabs: ${voiceConfig.name} para decir: "${text}"`);

                // Configuración optimizada para latencia mínima
                const requestData = {
                    text: text,
                    model_id: voiceConfig.model,
                    voice_settings: {
                        stability: 0.5, // Reducido para velocidad
                        similarity_boost: 0.7, // Reducido para velocidad
                        style: 0.3, // Reducido para velocidad
                        use_speaker_boost: true
                    },
                    optimize_streaming_latency: 4, // Máxima optimización
                    output_format: "mp3_22050_64" // Formato más liviano para velocidad
                };

                console.log('Enviando solicitud a ElevenLabs...');

                const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceConfig.voiceId}`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'audio/mpeg',
                        'Content-Type': 'application/json',
                        'xi-api-key': this.elevenLabsApiKey
                    },
                    body: JSON.stringify(requestData)
                });

                console.log('Respuesta de ElevenLabs:', response.status, response.statusText);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`ElevenLabs API error: ${response.status} - ${errorText}`);
                    // Usar fallback del navegador
                    this.speakWithBrowserTTS(text);
                    resolve();
                    return;
                }

                const audioBlob = await response.blob();
                console.log('Audio blob recibido, tamaño:', audioBlob.size);

                if (audioBlob.size === 0) {
                    console.error('Audio blob vacío');
                    this.speakWithBrowserTTS(text);
                    resolve();
                    return;
                }

                const audioUrl = URL.createObjectURL(audioBlob);

                // Guardar en cache
                if (this.audioCache.size >= 10) {
                    const firstKey = this.audioCache.keys().next().value;
                    const oldUrl = this.audioCache.get(firstKey);
                    URL.revokeObjectURL(oldUrl);
                    this.audioCache.delete(firstKey);
                }
                this.audioCache.set(cacheKey, audioUrl);

                const audio = new Audio(audioUrl);
                audio.volume = 1.0;
                audio.preload = 'auto'; // Precargar inmediatamente
                
                // Configurar para reproducción instantánea
                audio.onloadeddata = async () => {
                    try {
                        await audio.play(); // Reproducir apenas esté listo
                        console.log('Reproduciendo audio de ElevenLabs instantáneamente...');
                    } catch (playError) {
                        console.error('Error al reproducir audio:', playError);
                        this.speakWithBrowserTTS(text);
                        resolve();
                    }
                };

                audio.onended = () => {
                    console.log('ElevenLabs TTS completado exitosamente');
                    resolve();
                };

                audio.onerror = (error) => {
                    console.error('Error reproduciendo audio ElevenLabs:', error);
                    this.speakWithBrowserTTS(text);
                    resolve();
                };

                // Iniciar carga inmediata
                audio.load();

            } catch (error) {
                console.error('Error general con ElevenLabs TTS:', error);
                this.speakWithBrowserTTS(text);
                resolve();
            }
        });
    }

    speakWithBrowserTTS(text) {
        console.log('Usando TTS del navegador como fallback');
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            
            // Configurar idioma
            const langMap = {
                'es-ES': 'es-ES',
                'en-US': 'en-US',
                'zh-CN': 'zh-CN',
                'fr-FR': 'fr-FR',
                'de-DE': 'de-DE',
                'it-IT': 'it-IT',
                'pt-BR': 'pt-BR',
                'ja-JP': 'ja-JP',
                'ko-KR': 'ko-KR',
                'ru-RU': 'ru-RU',
                'ar-SA': 'ar-SA'
            };
            
            utterance.lang = langMap[this.currentTargetLanguage] || 'en-US';
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            speechSynthesis.speak(utterance);
        }
    }

    async simpleTranslateToLanguage(text, targetLang) {
        const translations = {
            'es-ES': {
                'hello': 'hola', 'goodbye': 'adiós', 'thank you': 'gracias', 'please': 'por favor',
                'yes': 'sí', 'no': 'no', 'good morning': 'buenos días', 'good night': 'buenas noches',
                'how are you': 'cómo estás', 'very good': 'muy bien', 'good': 'bien', 'bad': 'mal',
                'house': 'casa', 'water': 'agua', 'food': 'comida', 'family': 'familia'
            },
            'zh-CN': {
                'hola': '你好', 'adiós': '再见', 'gracias': '谢谢', 'por favor': '请',
                'sí': '是', 'no': '不', 'buenos días': '早上好', 'buenas noches': '晚安',
                'cómo estás': '你好吗', 'muy bien': '很好', 'bien': '好', 'mal': '坏',
                'casa': '家', 'agua': '水', 'comida': '食物', 'familia': '家庭'
            },
            'en-US': {
                'hola': 'hello', 'adiós': 'goodbye', 'gracias': 'thank you', 'por favor': 'please',
                'sí': 'yes', 'no': 'no', 'buenos días': 'good morning', 'buenas noches': 'good night',
                'cómo estás': 'how are you', 'muy bien': 'very good', 'bien': 'good', 'mal': 'bad',
                'casa': 'house', 'water': 'water', 'comida': 'food', 'familia': 'family'
            },
            'fr-FR': {
                'hola': 'bonjour', 'adiós': 'au revoir', 'gracias': 'merci', 'por favor': 's\'il vous plaît',
                'sí': 'oui', 'no': 'non', 'buenos días': 'bonjour', 'buenas noches': 'bonne nuit',
                'cómo estás': 'comment allez-vous', 'muy bien': 'très bien', 'bien': 'bien', 'mal': 'mal',
                'casa': 'maison', 'agua': 'eau', 'comida': 'nourriture', 'familia': 'famille'
            },
            'de-DE': {
                'hola': 'hallo', 'adiós': 'auf wiedersehen', 'gracias': 'danke', 'por favor': 'bitte',
                'sí': 'ja', 'no': 'nein', 'buenos días': 'guten morgen', 'buenas noches': 'gute nacht',
                'cómo estás': 'wie geht es dir', 'muy bien': 'sehr gut', 'bien': 'gut', 'mal': 'schlecht',
                'casa': 'haus', 'agua': 'wasser', 'comida': 'essen', 'familia': 'familie'
            },
            'it-IT': {
                'hola': 'ciao', 'adiós': 'arrivederci', 'gracias': 'grazie', 'por favor': 'per favore',
                'sí': 'sì', 'no': 'no', 'buenos días': 'buongiorno', 'buenas noches': 'buonanotte',
                'cómo estás': 'come stai', 'muy bien': 'molto bene', 'bien': 'bene', 'mal': 'male',
                'casa': 'casa', 'agua': 'acqua', 'comida': 'cibo', 'familia': 'famiglia'
            },
            'pt-BR': {
                'hola': 'olá', 'adiós': 'tchau', 'gracias': 'obrigado', 'por favor': 'por favor',
                'sí': 'sim', 'no': 'não', 'buenos días': 'bom dia', 'buenas noches': 'boa noite',
                'cómo estás': 'como você está', 'muy bien': 'muito bem', 'bien': 'bem', 'mal': 'mal',
                'casa': 'casa', 'agua': 'água', 'comida': 'comida', 'familia': 'família'
            },
            'ja-JP': {
                'hola': 'こんにちは', 'adiós': 'さようなら', 'gracias': 'ありがとう', 'por favor': 'お願いします',
                'sí': 'はい', 'no': 'いいえ', 'buenos días': 'おはよう', 'buenas noches': 'おやすみ',
                'cómo estás': '元気ですか', 'muy bien': 'とても良い', 'bien': '良い', 'mal': '悪い',
                'casa': '家', 'agua': '水', 'comida': '食べ物', 'familia': '家族'
            },
            'ko-KR': {
                'hola': '안녕하세요', 'adiós': '안녕히 가세요', 'gracias': '감사합니다', 'por favor': '부탁합니다',
                'sí': '네', 'no': '아니요', 'buenos días': '좋은 아침', 'buenas noches': '좋은 밤',
                'cómo estás': '어떻게 지내세요', 'muy bien': '아주 좋아요', 'bien': '좋아요', 'mal': '나빠요',
                'casa': '집', 'agua': '물', 'comida': '음식', 'familia': '가족'
            },
            'ru-RU': {
                'hola': 'привет', 'adiós': 'до свидания', 'gracias': 'спасибо', 'por favor': 'пожалуйста',
                'sí': 'да', 'no': 'нет', 'buenos días': 'доброе утро', 'buenas noches': 'спокойной ночи',
                'cómo estás': 'как дела', 'muy bien': 'очень хорошо', 'bien': 'хорошо', 'mal': 'плохо',
                'casa': 'дом', 'agua': 'вода', 'comida': 'еда', 'familia': 'семья'
            },
            'ar-SA': {
                'hola': 'مرحبا', 'adiós': 'وداعا', 'gracias': 'شكرا', 'por favor': 'من فضلك',
                'sí': 'نعم', 'no': 'لا', 'buenos días': 'صباح الخير', 'buenas noches': 'ليلة سعيدة',
                'cómo estás': 'كيف حالك', 'muy bien': 'جيد جدا', 'bien': 'جيد', 'mal': 'سيء',
                'casa': 'بيت', 'agua': 'ماء', 'comida': 'طعام', 'familia': 'عائلة'
            }
        };

        const langTranslations = translations[targetLang] || translations['en-US'];
        const lowerText = text.toLowerCase();

        for (const [spanish, translated] of Object.entries(langTranslations)) {
            if (lowerText.includes(spanish)) {
                return text.toLowerCase().replace(spanish, translated);
            }
        }

        // Solo devolver el texto traducido, sin prefijos
        return text;
    }

    initializeEventListeners() {
        this.recordButton.addEventListener('click', () => {
            if (this.isRecording) {
                this.stopRecording();
            } else {
                this.startRecording();
            }
        });

        // Event listener para selector de idioma
        this.targetLanguageSelect.addEventListener('change', (e) => {
            this.currentTargetLanguage = e.target.value;
            this.currentLanguageName = this.languageConfig[this.currentTargetLanguage]?.name || 'Idioma';
            console.log(`Idioma cambiado a: ${this.currentLanguageName}`);

            // Animación de cambio de idioma
            this.englishText.classList.add('language-change-wave');
            setTimeout(() => {
                this.englishText.classList.remove('language-change-wave');
            }, 800);

            // Actualizar placeholder del texto traducido
            this.updateLanguageDisplay();
        });

        // Detectar nivel de audio para mejorar sensibilidad
        this.startAudioLevelMonitoring();
    }

    startAudioLevelMonitoring() {
        if (!this.analyser) return;

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

        const checkAudioLevel = () => {
            if (this.isRecording && !this.isSpeaking && !this.isWaitingToSpeak) {
                this.analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

                // Ajustar sensibilidad visual basada en el nivel de audio
                if (average > 8) { // Umbral muy bajo para detectar voz suave
                    this.spanishText.style.transform = `scale(${1 + average / 300})`;
                    this.spanishText.style.opacity = Math.min(1, 0.7 + average / 100);
                    this.spanishText.classList.add('voice-detected');
                } else {
                    this.spanishText.style.transform = 'scale(1)';
                    this.spanishText.style.opacity = '1';
                    this.spanishText.classList.remove('voice-detected');
                }
            }

            if (this.isRecording) {
                requestAnimationFrame(checkAudioLevel);
            }
        };

        if (this.isRecording) {
            requestAnimationFrame(checkAudioLevel);
        }
    }

    startRecording() {
        if (!this.recognition) {
            return;
        }

        this.isRecording = true;
        this.isSpeaking = false;
        this.isWaitingToSpeak = false;
        this.recordButton.classList.add('recording');
        this.spanishText.textContent = 'Escuchando...';
        this.spanishText.classList.add('float-animation');
        this.englishText.textContent = `Detectando para ${this.currentLanguageName}...`;
        this.englishText.classList.add('typing-effect');

        // Reiniciar audio context si está suspendido
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        this.startAudioLevelMonitoring();

        try {
            this.recognition.start();
        } catch (error) {
            console.error('Error al iniciar reconocimiento:', error);
            this.stopRecording();
        }
    }

    stopRecording() {
        this.isRecording = false;
        this.isSpeaking = false;
        this.isWaitingToSpeak = false;
        this.recordButton.classList.remove('recording');
        this.spanishText.classList.remove('listening');

        if (this.recognition) {
            this.recognition.stop();
        }

        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
        }

        // Pausar cualquier audio de ElevenLabs que esté reproduciéndose
        const audioElements = document.querySelectorAll('audio');
        audioElements.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });

        this.spanishText.textContent = 'Presiona el botón para comenzar...';
        this.englishText.textContent = `Traducirá a ${this.currentLanguageName}...`;
        this.spanishText.style.transform = 'scale(1)';
        this.spanishText.style.opacity = '1';

        // Limpiar todas las animaciones
        this.spanishText.classList.remove('float-animation', 'voice-detected', 'typing-effect');
        this.englishText.classList.remove('translating', 'typing-effect', 'language-change-wave');
    }
}

// Inicializar cuando la página cargue
document.addEventListener('DOMContentLoaded', () => {
    if ('speechSynthesis' in window) {
        speechSynthesis.onvoiceschanged = () => {
            console.log('Voces cargadas:', speechSynthesis.getVoices().length);
        };
    }

    new LiveTranslator();
});
