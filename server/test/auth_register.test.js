import app from '../src/app.js';
import http from 'node:http';

async function testAuthRegister() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`\n🧪 Testing POST /api/v1/auth/register on ${baseUrl}...\n`);

  try {
    // Test 1: Invalid payload (missing required fields)
    console.log('1. Testing validation failure on empty body...');
    const res1 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data1 = await res1.json();
    console.log(`   Status: ${res1.status} (Expected: 400)`);
    console.log(`   Success: ${data1.success}, Error Message: ${data1.message}`);
    if (res1.status !== 400) throw new Error('Test 1 Failed: Expected 400');

    // Test 2: Successful registration
    console.log('\n2. Testing valid registration...');
    const validStudent = {
      universityId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      rollNumber: '2026CS101',
      email: 'alex.doe@univ.edu',
      password: 'SecurePassword123!',
      fullName: 'Alex Doe',
      phone: '+919876543210',
      gender: 'male',
    };
    const res2 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validStudent),
    });
    const data2 = await res2.json();
    console.log(`   Status: ${res2.status} (Expected: 201)`);
    console.log(`   Success: ${data2.success}, Message: ${data2.message}`);
    console.log(`   Created User ID: ${data2.data.id}, Role: ${data2.data.role}, Status: ${data2.data.status}`);
    console.log(`   Password Hash exposed?: ${data2.data.passwordHash !== undefined}`);
    if (res2.status !== 201 || data2.data.passwordHash !== undefined || data2.data.status !== 'pending_verification') {
      throw new Error('Test 2 Failed');
    }

    // Test 3: Duplicate registration (Email conflict)
    console.log('\n3. Testing duplicate registration (409 Conflict)...');
    const res3 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validStudent),
    });
    const data3 = await res3.json();
    console.log(`   Status: ${res3.status} (Expected: 409)`);
    console.log(`   Success: ${data3.success}, Message: ${data3.message}`);
    if (res3.status !== 409) throw new Error('Test 3 Failed: Expected 409');

    console.log('\n✅ All Auth Register tests passed successfully!\n');
  } finally {
    server.close();
  }
}

testAuthRegister().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
