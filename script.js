
class LiveTranslator {
    constructor() {
        this.isRecording = false;
        this.recognition = null;
        this.recordButton = document.getElementById('recordButton');
        this.spanishText = document.getElementById('spanishText');
        this.englishText = document.getElementById('englishText');
        this.status = document.getElementById('status');
        this.cameraVideo = document.getElementById('cameraVideo');
        this.signLanguageWord = document.getElementById('signLanguageWord');
        this.targetLanguageSelect = document.getElementById('targetLanguage');
        this.avatarCanvas = document.getElementById('avatarCanvas');
        this.avatarCtx = this.avatarCanvas.getContext('2d');
        this.lastSpokenText = '';
        this.isSpeaking = false;
        this.isWaitingToSpeak = false;
        this.speechQueue = [];
        this.silenceTimer = null;
        this.lastSpeechTime = 0;
        this.currentTargetLanguage = 'zh-CN';
        this.currentSignAnimation = null;
        this.animationFrame = 0;
        this.currentLanguageName = 'Chino';
        
        this.initializeCamera();
        this.initializeSpeechRecognition();
        this.initializeEventListeners();
        this.initializeSignLanguageDictionary();
        this.initializeAvatar();
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

    initializeAvatar() {
        // Configurar el avatar 3D
        this.avatar = {
            head: { x: 90, y: 30, size: 25 },
            body: { x: 90, y: 65, width: 20, height: 40 },
            leftArm: { 
                shoulder: { x: 70, y: 50 },
                elbow: { x: 55, y: 70 },
                hand: { x: 45, y: 85 }
            },
            rightArm: { 
                shoulder: { x: 110, y: 50 },
                elbow: { x: 125, y: 70 },
                hand: { x: 135, y: 85 }
            },
            leftLeg: { 
                hip: { x: 80, y: 105 },
                knee: { x: 75, y: 120 },
                foot: { x: 70, y: 130 }
            },
            rightLeg: { 
                hip: { x: 100, y: 105 },
                knee: { x: 105, y: 120 },
                foot: { x: 110, y: 130 }
            }
        };
        
        this.drawAvatar();
        this.startAvatarAnimation();
    }

    drawAvatar() {
        const ctx = this.avatarCtx;
        ctx.clearRect(0, 0, this.avatarCanvas.width, this.avatarCanvas.height);
        
        // Configurar estilo
        ctx.strokeStyle = '#4CAF50';
        ctx.fillStyle = '#4CAF50';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        
        // Cabeza
        ctx.beginPath();
        ctx.arc(this.avatar.head.x, this.avatar.head.y, this.avatar.head.size, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Ojos
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.arc(this.avatar.head.x - 8, this.avatar.head.y - 5, 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(this.avatar.head.x + 8, this.avatar.head.y - 5, 2, 0, 2 * Math.PI);
        ctx.fill();
        
        // Boca
        ctx.beginPath();
        ctx.arc(this.avatar.head.x, this.avatar.head.y + 8, 6, 0, Math.PI);
        ctx.stroke();
        
        // Cuerpo
        ctx.beginPath();
        ctx.rect(this.avatar.body.x - this.avatar.body.width/2, 
                this.avatar.body.y, 
                this.avatar.body.width, 
                this.avatar.body.height);
        ctx.stroke();
        
        // Brazos
        this.drawArm('left');
        this.drawArm('right');
        
        // Piernas
        this.drawLeg('left');
        this.drawLeg('right');
        
        // Manos (destacadas para lengua de señas)
        this.drawHand('left');
        this.drawHand('right');
    }

    drawArm(side) {
        const ctx = this.avatarCtx;
        const arm = this.avatar[`${side}Arm`];
        
        ctx.beginPath();
        ctx.moveTo(arm.shoulder.x, arm.shoulder.y);
        ctx.lineTo(arm.elbow.x, arm.elbow.y);
        ctx.lineTo(arm.hand.x, arm.hand.y);
        ctx.stroke();
    }

    drawLeg(side) {
        const ctx = this.avatarCtx;
        const leg = this.avatar[`${side}Leg`];
        
        ctx.beginPath();
        ctx.moveTo(leg.hip.x, leg.hip.y);
        ctx.lineTo(leg.knee.x, leg.knee.y);
        ctx.lineTo(leg.foot.x, leg.foot.y);
        ctx.stroke();
    }

    drawHand(side) {
        const ctx = this.avatarCtx;
        const hand = this.avatar[`${side}Arm`].hand;
        
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(hand.x, hand.y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#4CAF50';
        ctx.stroke();
    }

    startAvatarAnimation() {
        const animate = () => {
            this.animationFrame++;
            
            if (this.currentSignAnimation) {
                this.updateSignAnimation();
            } else {
                this.idleAnimation();
            }
            
            this.drawAvatar();
            requestAnimationFrame(animate);
        };
        
        animate();
    }

    idleAnimation() {
        // Animación suave de respiración
        const breathe = Math.sin(this.animationFrame * 0.02) * 2;
        this.avatar.body.y = 65 + breathe;
        this.avatar.head.y = 30 + breathe * 0.5;
    }

    updateSignAnimation() {
        const animation = this.currentSignAnimation;
        const progress = Math.min((this.animationFrame - animation.startFrame) / animation.duration, 1);
        
        if (progress >= 1) {
            this.currentSignAnimation = null;
            return;
        }
        
        // Interpolación suave entre posiciones
        const easeProgress = this.easeInOutCubic(progress);
        
        for (const [part, positions] of Object.entries(animation.keyframes)) {
            if (this.avatar[part]) {
                for (const [coord, value] of Object.entries(positions)) {
                    if (typeof this.avatar[part][coord] === 'object') {
                        for (const [subCoord, subValue] of Object.entries(value)) {
                            const start = animation.startPositions[part][coord][subCoord];
                            const target = subValue;
                            this.avatar[part][coord][subCoord] = start + (target - start) * easeProgress;
                        }
                    } else {
                        const start = animation.startPositions[part][coord];
                        const target = value;
                        this.avatar[part][coord] = start + (target - start) * easeProgress;
                    }
                }
            }
        }
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    performSignLanguageGesture(word) {
        const gestureMap = {
            'hola': this.createWaveGesture(),
            'adiós': this.createGoodbyeGesture(),
            'gracias': this.createThankYouGesture(),
            'sí': this.createYesGesture(),
            'no': this.createNoGesture(),
            'por favor': this.createPleaseGesture(),
            'agua': this.createWaterGesture(),
            'comer': this.createEatGesture(),
            'dormir': this.createSleepGesture(),
            'familia': this.createFamilyGesture(),
            'casa': this.createHouseGesture(),
            'tiempo': this.createTimeGesture(),
            'bien': this.createGoodGesture(),
            'mal': this.createBadGesture(),
            'yo': this.createMeGesture(),
            'tú': this.createYouGesture(),
            'default': this.createDefaultGesture()
        };
        
        const gesture = gestureMap[word.toLowerCase()] || gestureMap['default'];
        this.executeGesture(gesture);
    }

    createWaveGesture() {
        return {
            keyframes: {
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 130, y: 40 },
                    hand: { x: 150, y: 35 }
                }
            },
            duration: 60
        };
    }

    createGoodbyeGesture() {
        return {
            keyframes: {
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 125, y: 35 },
                    hand: { x: 140, y: 25 }
                },
                leftArm: {
                    shoulder: { x: 70, y: 50 },
                    elbow: { x: 55, y: 35 },
                    hand: { x: 40, y: 25 }
                }
            },
            duration: 80
        };
    }

    createThankYouGesture() {
        return {
            keyframes: {
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 105, y: 40 },
                    hand: { x: 100, y: 30 }
                },
                head: { x: 90, y: 25 }
            },
            duration: 70
        };
    }

    createYesGesture() {
        return {
            keyframes: {
                head: { x: 90, y: 35 }
            },
            duration: 40
        };
    }

    createNoGesture() {
        return {
            keyframes: {
                head: { x: 85, y: 30 },
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 130, y: 60 },
                    hand: { x: 145, y: 55 }
                }
            },
            duration: 50
        };
    }

    createPleaseGesture() {
        return {
            keyframes: {
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 105, y: 65 },
                    hand: { x: 90, y: 75 }
                }
            },
            duration: 60
        };
    }

    createWaterGesture() {
        return {
            keyframes: {
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 115, y: 40 },
                    hand: { x: 105, y: 25 }
                }
            },
            duration: 50
        };
    }

    createEatGesture() {
        return {
            keyframes: {
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 105, y: 35 },
                    hand: { x: 90, y: 25 }
                }
            },
            duration: 60
        };
    }

    createSleepGesture() {
        return {
            keyframes: {
                head: { x: 85, y: 35 },
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 95, y: 40 },
                    hand: { x: 85, y: 30 }
                }
            },
            duration: 80
        };
    }

    createFamilyGesture() {
        return {
            keyframes: {
                leftArm: {
                    shoulder: { x: 70, y: 50 },
                    elbow: { x: 60, y: 65 },
                    hand: { x: 55, y: 75 }
                },
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 120, y: 65 },
                    hand: { x: 125, y: 75 }
                }
            },
            duration: 70
        };
    }

    createHouseGesture() {
        return {
            keyframes: {
                leftArm: {
                    shoulder: { x: 70, y: 50 },
                    elbow: { x: 65, y: 40 },
                    hand: { x: 75, y: 30 }
                },
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 115, y: 40 },
                    hand: { x: 105, y: 30 }
                }
            },
            duration: 60
        };
    }

    createTimeGesture() {
        return {
            keyframes: {
                leftArm: {
                    shoulder: { x: 70, y: 50 },
                    elbow: { x: 75, y: 65 },
                    hand: { x: 80, y: 70 }
                },
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 100, y: 60 },
                    hand: { x: 85, y: 65 }
                }
            },
            duration: 50
        };
    }

    createGoodGesture() {
        return {
            keyframes: {
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 125, y: 55 },
                    hand: { x: 140, y: 50 }
                }
            },
            duration: 50
        };
    }

    createBadGesture() {
        return {
            keyframes: {
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 125, y: 60 },
                    hand: { x: 135, y: 75 }
                }
            },
            duration: 50
        };
    }

    createMeGesture() {
        return {
            keyframes: {
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 105, y: 65 },
                    hand: { x: 90, y: 70 }
                }
            },
            duration: 40
        };
    }

    createYouGesture() {
        return {
            keyframes: {
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 125, y: 55 },
                    hand: { x: 145, y: 60 }
                }
            },
            duration: 40
        };
    }

    createDefaultGesture() {
        return {
            keyframes: {
                rightArm: {
                    shoulder: { x: 110, y: 50 },
                    elbow: { x: 120, y: 65 },
                    hand: { x: 125, y: 80 }
                },
                leftArm: {
                    shoulder: { x: 70, y: 50 },
                    elbow: { x: 60, y: 65 },
                    hand: { x: 55, y: 80 }
                }
            },
            duration: 60
        };
    }

    executeGesture(gesture) {
        // Guardar posiciones actuales como punto de inicio
        gesture.startPositions = JSON.parse(JSON.stringify(this.avatar));
        gesture.startFrame = this.animationFrame;
        
        this.currentSignAnimation = gesture;
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

    initializeSignLanguageDictionary() {
        this.signLanguageDictionary = {
            // Saludos y cortesía
            'hola': { emoji: '👋', word: 'Hola' },
            'adiós': { emoji: '🤝', word: 'Adiós' },
            'adios': { emoji: '🤝', word: 'Adiós' },
            'gracias': { emoji: '🙏', word: 'Gracias' },
            'por favor': { emoji: '🤲', word: 'Por favor' },
            'perdón': { emoji: '🙋‍♂️', word: 'Perdón' },
            'disculpa': { emoji: '🙋‍♂️', word: 'Disculpa' },
            
            // Respuestas básicas
            'sí': { emoji: '👍', word: 'Sí' },
            'si': { emoji: '👍', word: 'Sí' },
            'no': { emoji: '👎', word: 'No' },
            'bien': { emoji: '👌', word: 'Bien' },
            'mal': { emoji: '👎', word: 'Mal' },
            'muy bien': { emoji: '💪', word: 'Muy bien' },
            
            // Tiempo del día
            'buenos días': { emoji: '☀️', word: 'Buenos días' },
            'buenas noches': { emoji: '🌙', word: 'Buenas noches' },
            'buenas tardes': { emoji: '🌅', word: 'Buenas tardes' },
            
            // Preguntas comunes
            'cómo estás': { emoji: '🤔', word: '¿Cómo estás?' },
            'como estas': { emoji: '🤔', word: '¿Cómo estás?' },
            'cómo te llamas': { emoji: '👤', word: '¿Cómo te llamas?' },
            'como te llamas': { emoji: '👤', word: '¿Cómo te llamas?' },
            'qué tal': { emoji: '😊', word: '¿Qué tal?' },
            'que tal': { emoji: '😊', word: '¿Qué tal?' },
            
            // Familia
            'familia': { emoji: '👨‍👩‍👧‍👦', word: 'Familia' },
            'papá': { emoji: '👨', word: 'Papá' },
            'papa': { emoji: '👨', word: 'Papá' },
            'mamá': { emoji: '👩', word: 'Mamá' },
            'mama': { emoji: '👩', word: 'Mamá' },
            'hermano': { emoji: '👦', word: 'Hermano' },
            'hermana': { emoji: '👧', word: 'Hermana' },
            'hijo': { emoji: '👶', word: 'Hijo' },
            'hija': { emoji: '👶', word: 'Hija' },
            
            // Emociones
            'feliz': { emoji: '😊', word: 'Feliz' },
            'triste': { emoji: '😢', word: 'Triste' },
            'enojado': { emoji: '😠', word: 'Enojado' },
            'sorprendido': { emoji: '😮', word: 'Sorprendido' },
            'cansado': { emoji: '😴', word: 'Cansado' },
            'emocionado': { emoji: '🤩', word: 'Emocionado' },
            
            // Casa y lugares
            'casa': { emoji: '🏠', word: 'Casa' },
            'escuela': { emoji: '🏫', word: 'Escuela' },
            'trabajo': { emoji: '💼', word: 'Trabajo' },
            'hospital': { emoji: '🏥', word: 'Hospital' },
            'tienda': { emoji: '🏪', word: 'Tienda' },
            'parque': { emoji: '🌳', word: 'Parque' },
            
            // Comida y bebida
            'agua': { emoji: '💧', word: 'Agua' },
            'comida': { emoji: '🍽️', word: 'Comida' },
            'pan': { emoji: '🍞', word: 'Pan' },
            'leche': { emoji: '🥛', word: 'Leche' },
            'café': { emoji: '☕', word: 'Café' },
            'cafe': { emoji: '☕', word: 'Café' },
            'té': { emoji: '🍵', word: 'Té' },
            'te': { emoji: '🍵', word: 'Té' },
            
            // Colores
            'rojo': { emoji: '🔴', word: 'Rojo' },
            'azul': { emoji: '🔵', word: 'Azul' },
            'verde': { emoji: '🟢', word: 'Verde' },
            'amarillo': { emoji: '🟡', word: 'Amarillo' },
            'negro': { emoji: '⚫', word: 'Negro' },
            'blanco': { emoji: '⚪', word: 'Blanco' },
            
            // Números
            'uno': { emoji: '1️⃣', word: 'Uno' },
            'dos': { emoji: '2️⃣', word: 'Dos' },
            'tres': { emoji: '3️⃣', word: 'Tres' },
            'cuatro': { emoji: '4️⃣', word: 'Cuatro' },
            'cinco': { emoji: '5️⃣', word: 'Cinco' },
            
            // Acciones
            'caminar': { emoji: '🚶', word: 'Caminar' },
            'correr': { emoji: '🏃', word: 'Correr' },
            'comer': { emoji: '🍽️', word: 'Comer' },
            'beber': { emoji: '🥤', word: 'Beber' },
            'dormir': { emoji: '😴', word: 'Dormir' },
            'estudiar': { emoji: '📚', word: 'Estudiar' },
            'leer': { emoji: '📖', word: 'Leer' },
            'escribir': { emoji: '✍️', word: 'Escribir' },
            
            // Transporte
            'carro': { emoji: '🚗', word: 'Carro' },
            'coche': { emoji: '🚗', word: 'Coche' },
            'autobús': { emoji: '🚌', word: 'Autobús' },
            'autobus': { emoji: '🚌', word: 'Autobús' },
            'bicicleta': { emoji: '🚲', word: 'Bicicleta' },
            'avión': { emoji: '✈️', word: 'Avión' },
            'avion': { emoji: '✈️', word: 'Avión' },
            
            // Tiempo
            'tiempo': { emoji: '⏰', word: 'Tiempo' },
            'hoy': { emoji: '📅', word: 'Hoy' },
            'ayer': { emoji: '📆', word: 'Ayer' },
            'mañana': { emoji: '📅', word: 'Mañana' },
            'semana': { emoji: '📅', word: 'Semana' },
            'mes': { emoji: '📅', word: 'Mes' },
            'año': { emoji: '📅', word: 'Año' },
            
            // Comunicación
            'hablar': { emoji: '💬', word: 'Hablar' },
            'escuchar': { emoji: '👂', word: 'Escuchar' },
            'ver': { emoji: '👀', word: 'Ver' },
            'mirar': { emoji: '👁️', word: 'Mirar' },
            'teléfono': { emoji: '📱', word: 'Teléfono' },
            'telefono': { emoji: '📱', word: 'Teléfono' },
            
            // Pronombres personales gestuales
            'yo': { emoji: '👆', word: 'Yo' },
            'tú': { emoji: '👉', word: 'Tú' },
            'tu': { emoji: '👉', word: 'Tú' },
            'él': { emoji: '👤', word: 'Él' },
            'el': { emoji: '👤', word: 'Él' },
            'ella': { emoji: '👤', word: 'Ella' },
            'nosotros': { emoji: '👥', word: 'Nosotros' },
            'ellos': { emoji: '👥', word: 'Ellos' }
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
        if (this.recognition.grammars) {
            this.recognition.grammars = null;
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
                
                // Mostrar lengua de señas en tiempo real
                this.updateSignLanguage(currentText);
                
                // Traducir inmediatamente con texto final
                if (finalTranscript.trim()) {
                    if (this.silenceTimer) {
                        clearTimeout(this.silenceTimer);
                    }
                    this.pauseListeningAndTranslate(finalTranscript);
                } else if (currentText.trim().length > 3) {
                    // Para texto intermedio, esperar menos
                    if (this.silenceTimer) {
                        clearTimeout(this.silenceTimer);
                    }
                    this.silenceTimer = setTimeout(() => {
                        if (!this.isSpeaking && currentText.trim()) {
                            this.pauseListeningAndTranslate(currentText);
                        }
                    }, 1000);
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
            
            this.englishText.textContent = translatedText;
            
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
            setTimeout(() => this.restartRecognition(), 1000);
        }
    }

    updateLanguageDisplay() {
        if (!this.isRecording) {
            this.englishText.textContent = `Traducirá a ${this.currentLanguageName}...`;
        }
    }

    updateSignLanguage(text) {
        const lowerText = text.toLowerCase();
        let foundSign = null;
        
        // Buscar la palabra más larga que coincida
        let longestMatch = '';
        for (const [phrase, signData] of Object.entries(this.signLanguageDictionary)) {
            if (lowerText.includes(phrase) && phrase.length > longestMatch.length) {
                longestMatch = phrase;
                foundSign = signData;
            }
        }
        
        if (foundSign) {
            this.signLanguageWord.textContent = foundSign.word;
            
            // Ejecutar gesto del avatar en tiempo real
            this.performSignLanguageGesture(longestMatch);
            
            // Efecto visual en el canvas
            this.avatarCanvas.style.boxShadow = '0 0 20px rgba(76, 175, 80, 0.8)';
            setTimeout(() => {
                this.avatarCanvas.style.boxShadow = 'none';
            }, 300);
        } else {
            // Gesto por defecto
            this.signLanguageWord.textContent = 'Hablando...';
            this.performSignLanguageGesture('default');
        }
    }

    

    async speakWithBrowser(text) {
        return new Promise((resolve) => {
            if ('speechSynthesis' in window) {
                speechSynthesis.cancel();
                
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = this.currentTargetLanguage;
                utterance.rate = 0.8;
                utterance.pitch = 1.0;
                utterance.volume = 0.9;
                
                // Buscar la mejor voz para el idioma seleccionado
                const voices = speechSynthesis.getVoices();
                const targetVoice = voices.find(voice => 
                    voice.lang === this.currentTargetLanguage || 
                    voice.lang.startsWith(this.currentTargetLanguage.split('-')[0])
                );
                
                if (targetVoice) {
                    utterance.voice = targetVoice;
                    console.log(`Usando voz: ${targetVoice.name} para ${this.currentTargetLanguage}`);
                }
                
                utterance.onend = resolve;
                utterance.onerror = resolve;
                
                speechSynthesis.speak(utterance);
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
                if (average > 15) { // Umbral aún más bajo para detectar voz lejana
                    this.spanishText.style.transform = `scale(${1 + average / 400})`;
                    this.spanishText.style.opacity = Math.min(1, 0.6 + average / 150);
                    
                    } else {
                    this.spanishText.style.transform = 'scale(1)';
                    this.spanishText.style.opacity = '1';
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
        this.englishText.textContent = `Detectando para ${this.currentLanguageName}...`;
        this.signLanguageWord.textContent = 'Escuchando';
        
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
        this.signLanguageWord.textContent = 'Listo';
        this.spanishText.style.transform = 'scale(1)';
        this.spanishText.style.opacity = '1';
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
