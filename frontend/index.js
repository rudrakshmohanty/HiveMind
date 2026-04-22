const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const app = express();
const PORT = 3000;
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

app.use('/api', createProxyMiddleware({ target: API_URL, changeOrigin: true }));
app.use(express.static(path.join(__dirname, 'build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Frontend listening on port ${PORT}`);
});
