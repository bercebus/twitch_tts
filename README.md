# Twitch TTS App

Una aplicación web ligera y auto-alojada para añadir funcionalidad Text-To-Speech (TTS) a tu canal de Twitch de forma totalmente privada y sin depender de servicios externos.

## Características

- 🎙️ **Voz Nativa y Personalizada:** Utiliza las voces de tu sistema operativo (Windows/macOS), con preferencia automática por el español.
- 🚀 **Cero Dependencias Externas:** La librería `tmi.js` se incluye localmente para evitar bloqueos de red o CDNs caídos.
- 🛡️ **Filtros Avanzados:** Opciones independientes para ignorar moderadores, VIPs, el Broadcaster o usuarios específicos por nombre.
- 🎚️ **Control Total:** Deslizantes para Volumen y Velocidad, además de un interruptor de Silencio (Mute).
- ✨ **Diseño Moderno:** Panel dividido con configuración a la izquierda e historial de mensajes en tiempo real a la derecha.
- 🔊 **Ajustes en Caliente:** Cambia el volumen o la voz en pleno directo sin necesidad de reiniciar la conexión.

## Cómo usarlo

Esta es una aplicación web estática que debe servirse a través de un protocolo HTTP para que el navegador permita el uso de la API de síntesis de voz.

### 1. Iniciar el servidor local

**Opción A: VS Code (Recomendada)**
1. Abre esta carpeta en Visual Studio Code.
2. Usa la extensión **Live Server** (clic derecho en `index.html` -> "Open with Live Server").

**Opción B: Python**
1. Abre una terminal en esta carpeta.
2. Ejecuta: `python -m http.server 8000`
3. Abre `http://localhost:8000` en tu navegador.

### 2. Configurar y Conectar

1. Introduce el nombre de tu **canal de Twitch**.
2. Selecciona la voz deseada y ajusta el volumen.
3. Configura tus filtros de ignorado (Moderadores, VIPs, etc.).
4. Haz clic en **Connect to Twitch**.
5. El cuadro de la derecha mostrará "Status: Connected" y comenzará a registrar y leer los mensajes.

### 3. Captura de Audio en OBS

Como la aplicación se ejecuta en tu navegador habitual:
1. Asegúrate de que el audio de tu navegador está siendo capturado por OBS (ya sea a través de "Audio de Escritorio" o "Captura de Audio de Aplicación").
2. Puedes redirigir el sonido de esta pestaña específica a otra salida de audio usando el "Mezclador de volumen" de Windows si prefieres que no se mezcle con otros sonidos.

---
*Desarrollado para ser sencillo, rápido y 100% local.*
