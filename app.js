//jshint esversion:6
const { Writable } = require('node:stream');
const express = require("express");
// const bodyParser = require("body-parser");
const _ = require("lodash");
const mongoose = require("mongoose");
const fs = require('fs').promises;
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');

const app = express();

// app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.static("public"));
// app.use(express.json());

// Connecting to database
async function readConfig() {
    try {
      const data = await fs.readFile('./config/DatabaseConnectionConfiguration.json', 'utf8');
      const jsonData = JSON.parse(data);
      const cfg = jsonData.filter(data => data.Datasource == "SUPPORTTOOLMONGODB")[0]
      const userpass = cfg.User && cfg.Password ? `${cfg.User}:${cfg.Password}@` : ''
      const port = cfg.Protocol == 'mongodb+srv' ? '' : `:${cfg.Port}`
      return `${cfg.Protocol}://${userpass}${cfg.Host}${port}/${cfg.Database}?retryWrites=true&w=majority&authSource=admin`
    } catch (err) {
      console.log("Error reading DatabaseConnectionConfiguration.json:", err);
      return null
    }
}
main().catch(err => console.log("MongoDB connection error:", err));
async function main() {
  await mongoose.connect(process.env.MONGO_URI || (await readConfig()) || 'mongodb://127.0.0.1:27017/blogDB', {
    // useNewUrlParser: true,
    // useUnifiedTopology: true
  });
}

const entrySchema = new mongoose.Schema({
  code: String,
  url: String
})
const Entry = mongoose.model("URLMap", entrySchema);

// Routes
// check db
app.get(["/","/api"], express.json(), function (req, res) {
  Entry.find().then(entries => {
    res.status(200).send(entries);
  }).catch(err => {
    console.log(err);
    res.status(500).send("Internal Server Error");
  });
});
// add to db
// app.post('/init', function(req, res){
//   const entry = new Entry({
//     code: "HorseManagement",
//     url: "10.88.197.9:5000",
//   });
//   entry.save()
//     .then(() => {
//       console.log('Post added to DB.');
//       res.status(200).send("Entry added.");
//     })
//     .catch(err => {
//       console.log(err);
//       res.status(400).send("Unable to save entry to database.");
//     });
// })
app.post(["/add", "/api"], express.json(), function (req, res) {
  const entry = new Entry({
    code: req.body.code,
    url: req.body.url
  });
  entry.save()
    .then(() => {
      console.log('Post added to DB.');
      res.redirect(303, '/api');
    })
    .catch(err => {
      console.log(err);
      res.status(400).send("Unable to save entry to database.");
    });
});
// clear db
app.delete("/api", express.json(), function (req, res) {
  Entry.deleteMany({}).then(() => {
    console.log('DB cleared.');
    res.redirect(303, '/api');
  }).catch(err => {
      console.log(err);
      res.status(400).send("Unable to clear database.");
  })
});


// redirect
// app.use("/api/:code{/*path}", function(req, res){
//   const appCode = req.params.code
//   // const apiPath = req.params.path || req.params[0]
//   const apiPath = Array.isArray(req.params.path) ? req.params.path.join('/') : req.params.path || req.params[0] || "";

//   Entry.findOne({ code: appCode })
//   .then(function (entry) {
//     const targetURL = entry.url + "/" + apiPath
//     const filteredHeaders = { ...req.headers };
//     delete filteredHeaders['content-length'];
//     delete filteredHeaders['transfer-encoding'];
//     delete filteredHeaders['host']; // Let fetch/target handle the host
//     fetch(targetURL, {
//       method: req.method,
//       headers: {
//         ...filteredHeaders,
//         // host: 'api.external-service.com' // Overwriting host is vital
//       },
//       body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined
//     })
//     .then(response => {
//       res.status(response.status);
//       // response.headers.forEach((value, key) => res.setHeader(key, value));
//       response.headers.forEach((value, key) => {
//         if (key !== 'transfer-encoding' && key !== 'content-encoding' && key !== 'content-length') {
//           res.setHeader(key, value);
//         }
//       });
//       return response.body.pipeTo(Writable.toWeb(res));
//       // return response.arrayBuffer();
//     })
//     // .then(buffer => {
//     //   console.log("[DEBUG] ",new TextDecoder().decode(Buffer.from(buffer)))
//     //   console.log("[DEBUG][HEADERS]",res.getHeaders());
//     //   // res.send(Buffer.from(buffer));
//     //   // res.send("ok")
//     //   res.send(new TextDecoder().decode(Buffer.from(buffer)));
//     // })
//     .catch(err => {
//       console.error('Fetch Error:', err);
//       if (!res.headersSent) {
//         res.status(500).send('Proxy Request Failed');
//       }
//     });
//   })
//   .catch(function (err) {
//     console.log(err);
//     res.status(404).send("Not Found");
//   });
// })
// const attachTarget = async (req, res, next) => {
//   const appCode = req.params.code
//   const apiPath = Array.isArray(req.params.path) ? req.params.path.join('/') : req.params.path || req.params[0] || "";
//   Entry.findOne({ code: appCode })
//     .then(function (entry) {
//       req.proxyTarget = entry.url+"/"+apiPath;
//       console.log("PROXY TARGET",req.proxyTarget)
//       next();
//     })
//     .catch(function (err) {
//       console.log(err);
//       res.status(404).send("Not Found");
//     });
// };
// app.use("/api/:code{/*path}", attachTarget, (req, res) => {createProxyMiddleware({
app.use("/api/:code{/*path}", createProxyMiddleware({
  // target: req.proxyTarget,
  target: "http://localhost:8080",
  changeOrigin: true,
  // onProxyReq: fixRequestBody,
  router: (req) => {
    const appCode = req.params.code
    // const apiPath = Array.isArray(req.params.path) ? req.params.path.join('/') : req.params.path || req.params[0] || "";
    return Entry.findOne({ code: appCode })
      .then(function (entry) {
        // console.log("PROXY TARGET", entry.url+"/"+apiPath);
        // return entry.url+"/"+apiPath;
        // console.log("PROXY TARGET", entry.url);
        return entry.url;
      })
      // .catch(function (err) {
      //   console.log(err);
      //   throw new Error("Not Found")
      //   // res.status(404).send("Not Found");
      // });
  },
  // pathRewrite: {'^/api/[^/]+': ''},
  pathRewrite: (path, req) => {
    // console.log("PATH", Array.isArray(req.params.path) ? req.params.path.join('/') : req.params.path || req.params[0] || "");
    // console.log("PATHIN", path)
    return Array.isArray(req.params.path) ? req.params.path.join('/') : req.params.path || req.params[0] || "";
  },
  on: {
    proxyReq: (proxyReq, req, res) => {
      // console.log('Final Proxy Path:', proxyReq.path);
      const protocol = proxyReq.protocol || (proxyReq.agent && proxyReq.agent.protocol) || 'http:';
      const host = proxyReq.getHeader('host');
      const path = proxyReq.path;
      const fullUrl = `${protocol}//${host}${path}`;
      console.log('[PROXY]', proxyReq.method, fullUrl);
    },
    // proxyRes: (proxyRes, req, res) => {
    //   /* handle proxyRes */
    // },
    error: (err, req, res) => {
      console.error('[ERROR]', err.message);
    },
  },
}))
// app.use("/test/:code/*", createProxyMiddleware({
//   target: "http://webhook.site/1057d5a1-dd2b-4f17-8538-870c268fcab3",
//   changeOrigin: true,
//   onProxyReq: fixRequestBody,
//   // onProxyReq: (proxyReq, req) => {
//   //   console.log(`[Proxy] ${req.method} ${req.url} -> ${proxyReq.host}${proxyReq.path}`);
//   // }
// }))

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log(`Server started on port ${port}`);
});

