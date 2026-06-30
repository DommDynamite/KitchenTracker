import test from 'node:test';
import assert from 'node:assert';
import { getDb } from '../database.js';

test('Gemini AI features - Database Migrations & Unlinked Ingredients', async () => {
  const db = await getDb();

  await db.run('BEGIN TRANSACTION');

  try {
    // 1. Create a mock product
    const prodResult = await db.run(`
      INSERT INTO products (name, default_unit, serving_size, serving_unit, servings_per_package)
      VALUES ('TEST_GEMINI_Salt', 'g', 1.0, 'g', 100.0)
    `);
    const saltProductId = prodResult.lastID;

    // 2. Create a mock recipe
    const recResult = await db.run(`
      INSERT INTO recipes (name, servings) VALUES ('TEST_GEMINI_Soup', 2.0)
    `);
    const recipeId = recResult.lastID;

    // 3. Insert a LINKED recipe ingredient
    await db.run(`
      INSERT INTO recipe_ingredients (recipe_id, product_id, amount, unit, name)
      VALUES (?, ?, 5.0, 'g', ?)
    `, [recipeId, saltProductId, 'TEST_GEMINI_Salt']);

    // 4. Insert an UNLINKED recipe ingredient (product_id is NULL)
    await db.run(`
      INSERT INTO recipe_ingredients (recipe_id, product_id, amount, unit, name)
      VALUES (?, NULL, 1.0, 'tsp', 'TEST_GEMINI_Oregano')
    `, [recipeId]);

    // 5. Fetch and verify recipe ingredients
    const ingredients = await db.all(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY id ASC',
      [recipeId]
    );

    assert.strictEqual(ingredients.length, 2);

    // Linked ingredient checks
    assert.strictEqual(ingredients[0].product_id, saltProductId);
    assert.strictEqual(ingredients[0].amount, 5.0);
    assert.strictEqual(ingredients[0].unit, 'g');
    assert.strictEqual(ingredients[0].name, 'TEST_GEMINI_Salt');

    // Unlinked ingredient checks
    assert.strictEqual(ingredients[1].product_id, null);
    assert.strictEqual(ingredients[1].amount, 1.0);
    assert.strictEqual(ingredients[1].unit, 'tsp');
    assert.strictEqual(ingredients[1].name, 'TEST_GEMINI_Oregano');

  } finally {
    await db.run('ROLLBACK');
  }
});

test('Gemini AI features - Recipe Chats History Persistence', async () => {
  const db = await getDb();

  await db.run('BEGIN TRANSACTION');

  try {
    // 1. Create a chat session (unlinked to recipe)
    const result = await db.run(`
      INSERT INTO recipe_chats (recipe_id, title, messages)
      VALUES (NULL, 'TEST_CHAT_Session', '[]')
    `);
    const chatId = result.lastID;

    // Verify it exists
    const chat = await db.get('SELECT * FROM recipe_chats WHERE id = ?', [chatId]);
    assert.ok(chat);
    assert.strictEqual(chat.title, 'TEST_CHAT_Session');
    assert.strictEqual(chat.recipe_id, null);
    assert.strictEqual(chat.messages, '[]');

    // 2. Append messages
    const mockMessages = [
      { role: 'user', content: 'What can I cook with tomatoes?' },
      { role: 'model', content: 'You can make a simple fresh tomato salad.' }
    ];

    await db.run(`
      UPDATE recipe_chats
      SET messages = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(mockMessages), chatId]);

    // Retrieve and verify messages
    const updatedChat = await db.get('SELECT * FROM recipe_chats WHERE id = ?', [chatId]);
    const parsedMessages = JSON.parse(updatedChat.messages);
    assert.strictEqual(parsedMessages.length, 2);
    assert.strictEqual(parsedMessages[0].role, 'user');
    assert.strictEqual(parsedMessages[0].content, 'What can I cook with tomatoes?');
    assert.strictEqual(parsedMessages[1].role, 'model');

    // 3. Delete chat session
    await db.run('DELETE FROM recipe_chats WHERE id = ?', [chatId]);
    const deletedChat = await db.get('SELECT * FROM recipe_chats WHERE id = ?', [chatId]);
    assert.strictEqual(deletedChat, undefined);

  } finally {
    await db.run('ROLLBACK');
  }
});
