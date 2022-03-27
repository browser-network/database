//
// This is what's hosting when you run `npm run start:dev`
//

const http = require('http')
const fs = require('fs')

const server = http.createServer((req, res) => {
  // if root is requested, send the index page. Otherwise
  // send what's requested.
  if (req.url === '/') {
    fs.readFile(__dirname + '/index.html', function (err,data) {
      if (err) {
        res.writeHead(404)
        res.end(JSON.stringify(err))
        return
      }
      res.writeHead(200)
      res.end(data)
    })
  } else {
    fs.readFile(__dirname + req.url, function (err,data) {
      if (err) {
        res.writeHead(404)
        res.end(JSON.stringify(err))
        return
      }
      res.writeHead(200)
      res.end(data)
    })
  }

})

const port = process.env.PORT || 8000
server.listen(port, () => {
  console.log(`##### network code is now being served, navigate to http://localhost:${port} to see network stats`)
})
