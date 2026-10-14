const app = require('./app');
const config = require('./config');
app.listen(config.port, () => console.log(`মাদরাসা API চালু: http://localhost:${config.port}`));
