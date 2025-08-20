# Gemini CLI Browser Companion

Una extensión de navegador que integra [Gemini CLI](https://github.com/google-gemini/gemini-cli) directamente en tu experiencia de navegación web.

## 🌟 Características

- **Contexto Inteligente**: Gemini CLI conoce la página web que estás viendo y puede ayudarte con su contenido
- **Texto Seleccionado**: Selecciona cualquier texto en una página web y Gemini CLI podrá analizarlo o responder preguntas sobre él
- **Sincronización Automática**: La extensión se mantiene sincronizada con tu sesión de Gemini CLI en tiempo real
- **Soporte Multi-navegador**: Compatible con Chrome y Firefox

## 🚀 Instalación

### Prerrequisitos

1. **Instala Gemini CLI** primero:
   ```bash
   npm install -g @google/gemini-cli
   ```
   
   O ejecútalo directamente:
   ```bash
   npx @google/gemini-cli
   ```

### Instalar la Extensión

#### Chrome
1. Descarga o clona este repositorio
2. Ejecuta `npm run build && npm run package`
3. Abre `chrome://extensions/`
4. Activa el "Modo de desarrollador"
5. Haz clic en "Cargar extensión sin empaquetar"
6. Selecciona la carpeta `packaging/chrome`

#### Firefox
1. Descarga o clona este repositorio
2. Ejecuta `npm run build && npm run package`
3. Abre `about:debugging`
4. Haz clic en "Este Firefox"
5. Haz clic en "Cargar complemento temporal"
6. Selecciona cualquier archivo en la carpeta `packaging/firefox`

## 📖 Uso

### Configuración Inicial

1. **Ejecuta Gemini CLI** en tu terminal:
   ```bash
   gemini
   ```

2. **Auténticate** siguiendo las instrucciones en pantalla

3. **Abre cualquier página web** - la extensión automáticamente detectará el contexto

### Funcionalidades

#### Contexto de Página
- La extensión automáticamente proporciona contexto sobre la página actual a Gemini CLI
- Incluye título de la página, URL, y estructura básica del contenido

#### Texto Seleccionado
- Selecciona cualquier texto en una página web
- Haz clic en el icono de la extensión para ver el texto seleccionado
- Gemini CLI automáticamente tendrá acceso a este texto para análisis

#### Gestión de Pestañas
- La extensión rastrea hasta 10 pestañas activas
- Proporciona contexto sobre tu sesión de navegación actual

## 🛠 Desarrollo

### Construcción

```bash
npm install
npm run build
```

### Modo de Desarrollo

```bash
npm run watch
```

### Empaquetado

```bash
npm run package
```

### Estructura del Proyecto

```
src/
├── background.ts          # Script de fondo que maneja comunicación MCP
├── content.ts             # Script de contenido que se ejecuta en páginas web
├── popup.ts              # Script de la ventana emergente
├── popup.html            # Interfaz de la ventana emergente
├── welcome.html          # Página de bienvenida
├── manifest.json         # Manifiesto de la extensión
├── browser-context-manager.ts  # Gestión del contexto del navegador
└── scripts/
    └── package.js        # Script de empaquetado
```

## 🔧 Configuración

La extensión se configura automáticamente cuando Gemini CLI está ejecutándose. No se requiere configuración manual adicional.

### Variables de Entorno

La extensión respeta las siguientes variables de entorno de Gemini CLI:
- `GEMINI_CLI_IDE_WORKSPACE_PATH` - Ruta del espacio de trabajo actual
- `GEMINI_CLI_IDE_SERVER_PORT` - Puerto del servidor MCP

## 🤝 Contribuir

1. Haz un fork del repositorio
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Haz commit de tus cambios (`git commit -am 'Añadir nueva funcionalidad'`)
4. Haz push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crea un Pull Request

## 📝 Licencia

Copyright 2025 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

## 🔗 Enlaces Útiles

- [Gemini CLI Documentation](https://github.com/google-gemini/gemini-cli#readme)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [Chrome Extension Development](https://developer.chrome.com/docs/extensions/)
- [Firefox Extension Development](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)

## ❓ Preguntas Frecuentes

### ¿Cómo sé si la extensión está funcionando?
Haz clic en el icono de la extensión en tu navegador. Deberías ver el estado de conexión y información sobre la página actual.

### ¿La extensión funciona sin Gemini CLI ejecutándose?
La extensión detectará contexto del navegador, pero necesitas tener Gemini CLI ejecutándose en tu terminal para obtener la funcionalidad completa.

### ¿Qué datos recopila la extensión?
La extensión solo recopila información sobre las páginas web que visitas y el texto que seleccionas para proporcionárselo a Gemini CLI. No envía datos a servidores externos más allá de lo que Gemini CLI normalmente haría.

### ¿Puedo usar la extensión con otras herramientas de IA?
Actualmente la extensión está diseñada específicamente para Gemini CLI, pero usa el protocolo MCP estándar que podría ser compatible con otras herramientas en el futuro.