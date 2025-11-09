// serve.js - versión CommonJS (funciona directo en Node)
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/test_cors.html') {
    const filePath = path.join(__dirname, 'test_cors.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(8080, () => {
  console.log('✅ Servidor HTTP corriendo en http://localhost:8080/test_cors.html');
});
