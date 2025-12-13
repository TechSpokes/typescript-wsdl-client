// Quick test script to verify the server is working
import http from 'http';

function testEndpoint(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`\n✅ GET ${path}`);
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response:`, JSON.parse(data));
        resolve();
      });
    }).on('error', (err) => {
      console.log(`\n❌ GET ${path}`);
      console.log(`Error:`, err.message);
      reject(err);
    });
  });
}

function testPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        console.log(`\n✅ POST ${path}`);
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response:`, JSON.parse(responseData));
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log(`\n❌ POST ${path}`);
      console.log(`Error:`, err.message);
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Fastify Gateway Server...\n');

  try {
    // Test health endpoint
    await testEndpoint('/health');

    // Test root endpoint
    await testEndpoint('/');

    // Test SOAP operation endpoint (should return "Not implemented" error)
    await testPost('/get-city-weather-by-zip', { ZIP: '90210' });

    console.log('\n\n✨ All tests completed!\n');
  } catch (error) {
    console.error('\n\n❌ Tests failed:', error.message);
    process.exit(1);
  }
}

runTests();

