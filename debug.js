require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User'); // Make sure path is correct

async function testDB() {
  console.log('⏳ 1. Starting debug check...');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ 2. Successfully connected to DB: ${mongoose.connection.name}`);

    // Create a new user directly
    const testEmail = `debug_${Date.now()}@test.com`; // Unique email
    const newUser = await User.create({
      username: 'Debug User',
      email: testEmail,
      password: 'password123'
    });
    console.log('✅ 3. User created successfully:', newUser.email);

    // Try to find the user immediately
    const foundUser = await User.findOne({ email: testEmail });
    
    if (foundUser) {
      console.log('🎉 4. SUCCESS! User found in the database:', foundUser._id);
      console.log('   (This confirms your DB connection and Writes are working)');
    } else {
      console.log('❌ 4. FAILURE! User was created but not found in query.');
    }

  } catch (error) {
    console.error('❌ Error occurred:', error.message);
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log('👋 Debug finished.');
  }
}

testDB();