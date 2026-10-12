# 🦑 Squid Game: Luz Roja, Luz Verde (Experiencia Distribuida)

## 📖 Descripción del Proyecto

Una recreación multijugador interactiva y en tiempo real del clásico "Luz Roja, Luz Verde" de *Squid Game*. Este proyecto utiliza una innovadora **arquitectura de pantalla distribuida**:
Un dispositivo principal (PC, Tablet o Smart TV) actúa como el **Host (Escenario 3D y Panel Frontman)**, mientras que los teléfonos móviles de los jugadores se convierten en los **Gamepads (Controles físicos)** al escanear un código QR.

La interfaz completa fue diseñada bajo los principios del **Cyber-Brutalismo** industrial, destacando sombras sólidas, tipografías pesadas, y colores de alto contraste (Rosa Neón y Teal). Además, cuenta con un motor de audio personalizado (`SoundEngine`) que sincroniza acústicamente eventos del servidor en tiempo real.

## 🏗️ Arquitectura y Tecnologías

El repositorio está dividido en 3 aplicaciones independientes (Monorepo):

### 1. Server (El Cerebro)

Backend autoritativo que procesa la física, distancias, reglas, eventos del semáforo y las eliminaciones con precisión de milisegundos.

* **Node.js / Express**

* **TypeScript**

* **Colyseus (v0.15+)**: Framework de WebSockets para multijugador.

* **CORS**: Habilitado para comunicación con frontends descentralizados.

### 2. Host-Screen (El Escenario y Panel de Control)

Aplicación para la pantalla principal. Muestra el código QR de conexión, el renderizado 3D de la arena y el Panel de Control del "Frontman" para administrar la partida.

* **React (Vite) / TypeScript**

* **React Three Fiber & Drei (v8+)**: Renderizado 3D, luces, sombras y modelos (`.glb`).

* **Colyseus.js**: Cliente de conexión.

* **qrcode.react**: Generación dinámica del QR de la sala.

### 3. Gamepad (El Control del Jugador)

Aplicación web progresiva orientada a móviles. Incluye botones L y R para correr alternadamente y un sensor de equilibrio háptico (acelerómetro simulado/físico) para la fase de Luz Roja.

* **React (Vite) / TypeScript**

* **Tailwind CSS (v3+)**: Estilizado brutalista rápido.

* **Colyseus.js**: Sincronización instantánea de inputs.

## 🚀 Instalación y Uso Local

Sigue estos pasos para correr el proyecto en tu red local (LAN) y jugar con tus amigos conectándose al mismo WiFi.

### 1. Clonar el repositorio

```
git clone https://github.com/AleexCh/squid-web.git
cd squid-web

```

### 2. Levantar el Servidor (Backend)

Abre una terminal, entra a la carpeta del servidor, instala las dependencias y arráncalo:

```
cd server
npm install
npm start

```

*(El servidor quedará escuchando en `http://localhost:2567` o el puerto de tu red local).*

### 3. Configurar IPs para Red Local

Para que tus dispositivos móviles puedan ver el servidor y el Gamepad, debes usar la **IP local de tu computadora** (ej. `192.168.x.x`) en lugar de `localhost`.

* En `host-screen/src/App.tsx`, verifica que `BACKEND_URL` apunte a tu IP.

* En `gamepad/src/App.tsx`, haz lo mismo para que el control encuentre el servidor.

### 4. Levantar los Frontends (Host y Gamepad)

Abre dos terminales adicionales.

**Para el Host-Screen:**

```
cd host-screen
npm install
npm run dev -- --host

```

**Para el Gamepad:**

```
cd gamepad
npm install
npm run dev -- --host

```

El parámetro `--host` expone las aplicaciones en tu red local. Abre la URL que te da el Host-Screen en el navegador de tu computadora, escanea el QR con tu teléfono ¡y sobrevive!

## ⚙️ Despliegue a Producción (Internet)

Si deseas llevar esto a internet público:

1. Sube la carpeta `server` a **Render** (Web Service, Node).

2. Actualiza los enlaces `BACKEND_URL` en el frontend con el link que te dé Render.

3. Sube la carpeta `gamepad` a **Netlify** o **Vercel**.

4. Actualiza la variable `gamepadUrl` en el Host-Screen.

5. Sube la carpeta `host-screen` a **Netlify** o **Vercel**.

## 👨‍💻 Autor y Créditos

**Desarrollado y diseñado por AleexCh.**

* 📸 **Instagram:** [@AleexCh](https://instagram.com/aleexch0)

*Este proyecto es de carácter educativo y de portafolio, inspirado en la serie "Squid Game" (El Juego del Calamar).*
