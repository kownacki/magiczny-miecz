import cors from 'cors';

export default (...args) => {
  const corsMiddleware = cors(...args);
  return (req, res) =>
    new Promise((resolve, reject) =>
      corsMiddleware(req, res, (err) => {
        err ? reject(err) : resolve();
      })
    );
};
