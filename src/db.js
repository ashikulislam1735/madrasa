const { MongoClient } = require('mongodb');
const config = require('./config');

let client, database;

// প্রথম ব্যবহারে সংযোগ খোলে (Atlas-এর mongodb+srv:// URI-ও চলবে)
async function db() {
  if (!database) {
    client = new MongoClient(config.mongoUri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000 });
    await client.connect();
    database = client.db(config.mongoDb);
  }
  return database;
}
const col = async (name) => (await db()).collection(name);
async function close() { if (client) await client.close(); client = database = null; }

// স্কিমা-সমতুল্য: ইনডেক্স ও ইউনিক নিয়ম
async function ensureIndexes() {
  const d = await db();
  await d.collection('users').createIndex({ role: 1, mobile: 1 }, { unique: true });
  await d.collection('students').createIndex({ studentCode: 1 }, { unique: true });
  await d.collection('students').createIndex({ jamaatId: 1 });
  await d.collection('attendance').createIndex({ studentId: 1, date: 1 });
  await d.collection('attendance').createIndex({ date: 1 });
  await d.collection('examResults').createIndex({ studentId: 1 });
  await d.collection('feePayments').createIndex({ month: 1 });
  await d.collection('feePayments').createIndex({ studentId: 1 });
  await d.collection('expenses').createIndex({ date: 1 });
  await d.collection('admissions').createIndex({ status: 1 });
  await d.collection('notices').createIndex({ createdAt: -1 });
}

module.exports = { db, col, close, ensureIndexes };
