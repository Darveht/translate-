
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
        this.currentTargetLanguage = 'zh-CN';
        this.currentLanguageName = 'Chino';
        
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
        this.languageConfig = {
            'zh-CN': { name: 'Chino', voice: 'zh-CN' },
            'en-US': { name: 'Inglés', voice: 'en-US' },
            'fr-FR': { name: 'Francés', voice: 'fr-FR' },
            'de-DE': { name: 'Alemán', voice: 'de-DE' },
            'it-IT': { name: 'Italiano', voice: 'it-IT' },
            'pt-BR': { name: 'Portugués', voice: 'pt-BR' },
            'ja-JP': { name: 'Japonés', voice: 'ja-JP' },
            'ko-KR': { name: 'Coreano', voice: 'ko-KR' },
            'ru-RU': { name: 'Ruso', voice: 'ru-RU' },
            'ar-SA': { name: 'Árabe', voice: 'ar-SA' }
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
                } else if (currentText.trim().length > 2) {
                    // Para texto intermedio, respuesta más rápida
                    if (this.silenceTimer) {
                        clearTimeout(this.silenceTimer);
                    }
                    this.silenceTimer = setTimeout(() => {
                        if (!this.isSpeaking && currentText.trim()) {
                            this.pauseListeningAndTranslate(currentText);
                        }
                    }, 500); // Reducido de 1000ms a 500ms
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
            // Usar solo voz del navegador para mejor compatibilidad y velocidad
            await this.speakWithBrowser(translatedText);
        } catch (error) {
            console.error('Error al hablar:', error);
        }
        
        // Reanudar escucha después de hablar
        this.isSpeaking = false;
        this.isWaitingToSpeak = false;
        
        if (this.isRecording) {
            setTimeout(() => this.restartRecognition(), 300); // Reducido de 1000ms a 300ms
        }
    }

    updateLanguageDisplay() {
        if (!this.isRecording) {
            this.englishText.textContent = `Traducirá a ${this.currentLanguageName}...`;
        }
    }

    

    

    async speakWithBrowser(text) {
        return new Promise((resolve) => {
            if ('speechSynthesis' in window) {
                speechSynthesis.cancel();
                
                // Esperar a que las voces estén disponibles
                const speakText = () => {
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.lang = this.currentTargetLanguage;
                    utterance.rate = 0.9; // Aumentado para mayor naturalidad
                    utterance.pitch = 1.1; // Ligeramente más alto
                    utterance.volume = 1.0; // Volumen máximo
                    
                    // Buscar la mejor voz para el idioma seleccionado
                    const voices = speechSynthesis.getVoices();
                    let targetVoice = voices.find(voice => 
                        voice.lang === this.currentTargetLanguage
                    );
                    
                    if (!targetVoice) {
                        targetVoice = voices.find(voice => 
                            voice.lang.startsWith(this.currentTargetLanguage.split('-')[0])
                        );
                    }
                    
                    // Preferir voces premium/mejoradas
                    if (!targetVoice) {
                        const premiumVoice = voices.find(voice => 
                            voice.name.includes('Premium') || 
                            voice.name.includes('Enhanced') ||
                            voice.name.includes('Neural')
                        );
                        if (premiumVoice) targetVoice = premiumVoice;
                    }
                    
                    if (targetVoice) {
                        utterance.voice = targetVoice;
                        console.log(`Usando voz: ${targetVoice.name} para ${this.currentTargetLanguage}`);
                    } else {
                        console.log(`Usando voz por defecto para ${this.currentTargetLanguage}`);
                    }
                    
                    utterance.onstart = () => {
                        console.log('Iniciando síntesis de voz');
                    };
                    
                    utterance.onend = () => {
                        console.log('Síntesis de voz completada');
                        resolve();
                    };
                    
                    utterance.onerror = (error) => {
                        console.error('Error en síntesis de voz:', error);
                        resolve();
                    };
                    
                    speechSynthesis.speak(utterance);
                };
                
                // Si no hay voces disponibles, esperar un poco
                if (speechSynthesis.getVoices().length === 0) {
                    speechSynthesis.onvoiceschanged = () => {
                        speechSynthesis.onvoiceschanged = null;
                        speakText();
                    };
                    // Timeout de seguridad
                    setTimeout(speakText, 100);
                } else {
                    speakText();
                }
            } else {
                resolve();
            }
        });
    }

    async simpleTranslateToLanguage(text, targetLang) {
        const translations = {
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
                'casa': 'house', 'agua': 'water', 'comida': 'food', 'familia': 'family'
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
        
        const langName = this.languageConfig[targetLang]?.name || 'target language';
        return `Traduciendo a ${langName}: ${text}`;
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
        
        // Cancelar síntesis de voz
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        
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
