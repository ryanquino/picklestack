import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import app from './app.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

// In production, serve static client build files
if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDistPath));

  // Fallback to index.html for SPA client-side routing
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Pickld server listening on port ${PORT}`);
});
