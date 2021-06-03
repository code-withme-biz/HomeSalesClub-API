import http from 'http';

interface CalleObject {
  [key: string]: {
    [key: string]: any;
  }
}

const modules: CalleObject = {};

// E/G/
// {"category":"public_records",
//  "products":["/fl/orange/civil_auction", "/fl/duval/civil_auction"],
//  "dateFrom":"04/04/20",
//  "dateTo":"04/12/20"}

var server = http.createServer(function(request, response) {
if (request.method == 'POST') {
        var body = '';
        request.on('data', function (data) {
            body += data;
        });
        request.on('end', function () {
            try {
              const post = JSON.parse(body);
              let promises = [];
              if (post && post.category !== 'public_records') {
                throw new Error('Must be public_records');
              }
              if (post && (post.dateFrom.length !== 8 || post.dateTo.length !== 8)) {
                throw new Error('Date must be in next format e.g. 04/12/20');
              }
              if (post && post.products && post.products.length ===0) {
                throw new Error('Products empty');
              }
              for (const product of post.products) {
                promises.push(new Promise((resolve) => {
                  if (!modules[product]) { modules[product] = {} }
                  const modulePath = `./categories/${post.category}${product}_product`;
                  if (modules[product] && modules[product]['in_progress']) {
                    resolve(`Parsing in progress for ${modulePath}, wait`);
                  } else {
                    import(modulePath).then(civil => {
                      const civilInst = new civil.default(post.dateFrom, post.dateTo);
                      civilInst.startParsing(() => {
                        delete modules[product];
                      });
                      resolve(`Start parsing ${modulePath}`);
                      modules[product]['in_progress'] = true;
                    }).catch(e => {
                      resolve(`Can't find the model named ${modulePath}`);
                    })
                  }
                }))
              }

              Promise.all(promises).then((values) => {
                response.writeHead(200, {"Content-Type": "text/plain"});
                response.write(values.join('\n'));
                response.end();
                return;
              });
            } catch (err) {
              response.writeHead(500, {"Content-Type": "text/plain"});
              response.write(`${err}\nBad Post Data. Is your data a proper JSON?\n`);
              response.end();
              return;
            }
        });
    }
});
server.listen(3000);
console.log("parser server started http://localhost:3000/ ")

// CURL EXAMPLES
// curl --header "Content-Type: application/json" \
//   --request POST \
//   --data '{"category":"public_records","products":["/fl/orange/civil_auction", "/fl/duval/civil_auction"], "dateFrom":"04/04/20", "dateTo":"04/12/20"}' \
//   http://localhost:3000/

// curl --header "Content-Type: application/json" \
//   --request POST \
//   --data '{"category":"public_records","products":["/fl/duval/civil_auction"], "dateFrom":"04/04/20", "dateTo":"04/10/20"}' \
//   http://localhost:3000/