import { createApp } from './app';

const port = Number(process.env.PORT || 4000);
const app = createApp();

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });
}

export { app };
