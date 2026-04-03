const express = require('express');
const app = express();
const PORT = 3010;

app.get('/', (req, res) => {
  res.send(`Server is running on port ${PORT}`);
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
