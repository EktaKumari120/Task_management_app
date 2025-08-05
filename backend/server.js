import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize SQLite database
const db = new sqlite3.Database(join(__dirname, 'tasks.db'));

// Create tasks table if it doesn't exist
db.serialize(() => {
  db.run(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in progress', 'completed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
  `);
});

// Middleware
app.use(cors());
app.use(express.json());

// Error handling middleware
const handleErrors = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
};

// Input validation middleware
const validateTask = (req, res, next) => {
  const { title, description, status } = req.body;
  
  if (!title || title.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Validation error',
      message: 'Title is required and cannot be empty' 
    });
  }
  
  if (status && !['pending', 'in progress', 'completed'].includes(status)) {
    return res.status(400).json({ 
      error: 'Validation error',
      message: 'Status must be one of: pending, in progress, completed' 
    });
  }
  
  next();
};

// Routes

// GET /tasks - Retrieve all tasks with optional filtering
app.get('/tasks', (req, res) => {
  const { status, search } = req.query;
  let query = 'SELECT * FROM tasks';
  const params = [];
  const conditions = [];
  
  if (status && status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }
  
  if (search) {
    conditions.push('(title LIKE ? OR description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY created_at DESC';
  
  db.all(query, params, (err, tasks) => {
    if (err) {
      return res.status(500).json({ 
        error: 'Database error',
        message: err.message 
      });
    }
    
    res.json({
      success: true,
      data: tasks,
      count: tasks.length
    });
  });
});

// POST /tasks - Create a new task
app.post('/tasks', validateTask, (req, res) => {
  const { title, description, status = 'pending' } = req.body;
  
  const query = `
    INSERT INTO tasks (title, description, status)
    VALUES (?, ?, ?)
  `;
  
  db.run(query, [title.trim(), description?.trim() || '', status], function(err) {
    if (err) {
      return res.status(500).json({ 
        error: 'Database error',
        message: err.message 
      });
    }
    
    db.get('SELECT * FROM tasks WHERE id = ?', [this.lastID], (err, newTask) => {
      if (err) {
        return res.status(500).json({ 
          error: 'Database error',
          message: err.message 
        });
      }
      
      res.status(201).json({
        success: true,
        message: 'Task created successfully',
        data: newTask
      });
    });
  });
});

// PUT /tasks/:id - Update an existing task
app.put('/tasks/:id', validateTask, (req, res) => {
  const { id } = req.params;
  const { title, description, status } = req.body;
  
  // Check if task exists
  db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, existingTask) => {
    if (err) {
      return res.status(500).json({ 
        error: 'Database error',
        message: err.message 
      });
    }
    
    if (!existingTask) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Task not found' 
      });
    }
    
    const query = `
      UPDATE tasks 
      SET title = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    db.run(query, [
      title.trim(), 
      description?.trim() || existingTask.description, 
      status || existingTask.status, 
      id
    ], function(err) {
      if (err) {
        return res.status(500).json({ 
          error: 'Database error',
          message: err.message 
        });
      }
      
      db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, updatedTask) => {
        if (err) {
          return res.status(500).json({ 
            error: 'Database error',
            message: err.message 
          });
        }
        
        res.json({
          success: true,
          message: 'Task updated successfully',
          data: updatedTask
        });
      });
    });
  });
});

// DELETE /tasks/:id - Delete a task
app.delete('/tasks/:id', (req, res) => {
  const { id } = req.params;
  
  // Check if task exists
  db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, existingTask) => {
    if (err) {
      return res.status(500).json({ 
        error: 'Database error',
        message: err.message 
      });
    }
    
    if (!existingTask) {
      return res.status(404).json({ 
        error: 'Not found',
        message: 'Task not found' 
      });
    }
    
    db.run('DELETE FROM tasks WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ 
          error: 'Database error',
          message: err.message 
        });
      }
      
      res.json({
        success: true,
        message: 'Task deleted successfully',
        data: existingTask
      });
    });
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// Handle 404 for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    message: 'Route not found' 
  });
});

// Error handling middleware
app.use(handleErrors);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: SQLite (tasks.db)`);
  console.log(`🔗 API endpoints available at http://localhost:${PORT}/tasks`);
});