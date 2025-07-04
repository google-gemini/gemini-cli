# Quickstart

This tutorial provides a hands-on introduction to the basic features of Gemini CLI.

## 1. Start a new project

Create a new directory and start Gemini CLI:

```bash
mkdir my-project
cd my-project
gemini
```

## 2. Generate code

Ask Gemini to generate some code for you. For example, you can ask it to create a simple web server:

```
> Create a simple web server in Node.js that listens on port 3000 and responds with "Hello, World!"
```

Gemini will create a file named `server.js` with the following content:

```javascript
const http = require('http');

const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello, World!');
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
```

## 3. Run the code

You can run the generated code directly from the Gemini CLI:

```
> !node server.js
```

## 4. Ask questions about your code

You can ask Gemini questions about your code. For example, you can ask it to explain the code it generated:

```
> Explain the code in server.js
```

## 5. Edit your code

You can also ask Gemini to edit your code. For example, you can ask it to add a new route to your web server:

```
> Add a new route to server.js that responds with the current date and time at /time
```

Gemini will update the `server.js` file with the new route.

## 6. Get help

You can get help at any time by typing `help` in the Gemini CLI.
