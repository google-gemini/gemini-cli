import http from 'http';

const server = http.createServer((req, res) => {
  console.log(JSON.stringify(req.headers, null, 2));
  res.writeHead(200);
  res.end('ok');
});

server.listen(0, async () => {
  const port = server.address().port;

  await fetch(`http://localhost:${port}/`, {
    headers: {
      Accept: 'application/json, text/event-stream',
      accept: 'application/json, text/event-stream',
    },
  });

  server.close();
});
