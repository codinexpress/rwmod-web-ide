const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = 3000;
const projectsBaseDir = path.join(__dirname, '..', 'projects_base'); // Adjusted path to be relative to src

// Middleware to parse JSON bodies
app.use(express.json());

// Ensure projects_base directory exists
async function ensureProjectsBaseDirExists() {
    try {
        await fs.access(projectsBaseDir);
        console.log(`Directory ${projectsBaseDir} already exists.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            try {
                await fs.mkdir(projectsBaseDir, { recursive: true });
                console.log(`Directory ${projectsBaseDir} created successfully.`);
            } catch (mkdirError) {
                console.error(`Error creating directory ${projectsBaseDir}:`, mkdirError);
                // Exit or handle critical error if base directory cannot be created
                process.exit(1);
            }
        } else {
            console.error(`Error accessing directory ${projectsBaseDir}:`, error);
            process.exit(1);
        }
    }
}


// Route to list projects
app.get('/api/projects', async (req, res) => {
    try {
        const entries = await fs.readdir(projectsBaseDir, { withFileTypes: true });
        const directories = entries
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        res.json(directories);
    } catch (error) {
        console.error('Error reading projects directory:', error);
        if (error.code === 'ENOENT') {
            return res.status(404).json({ message: `Projects base directory not found at ${projectsBaseDir}. Please create it.` });
        }
        res.status(500).json({ message: 'Failed to list projects' });
    }
});

// Route to list files and folders within a project
app.get('/api/files', async (req, res) => {
    const { project } = req.query;
    if (!project) {
        return res.status(400).json({ message: 'Project name query parameter is required' });
    }

    const projectPath = path.join(projectsBaseDir, project);
    try {
        const entries = await fs.readdir(projectPath, { withFileTypes: true });
        const filesAndFolders = entries.map(dirent => ({
            name: dirent.name,
            isDirectory: dirent.isDirectory(),
        }));
        res.json(filesAndFolders);
    } catch (error) {
        console.error(`Error reading directory for project ${project}:`, error);
        if (error.code === 'ENOENT') {
            return res.status(404).json({ message: `Project '${project}' not found.` });
        }
        res.status(500).json({ message: `Failed to list files for project '${project}'` });
    }
});

// Route to get a file's content
app.get('/api/file', async (req, res) => {
    const { project, filename } = req.query;
    if (!project || !filename) {
        return res.status(400).json({ message: 'Project and filename query parameters are required' });
    }

    // Basic path validation (more robust sanitization is needed for production)
    if (filename.includes('..')) {
        return res.status(400).json({ message: 'Invalid filename (path traversal detected).' });
    }

    const filePath = path.join(projectsBaseDir, project, filename);
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        res.type('text/plain').send(content);
    } catch (error) {
        console.error(`Error reading file ${filename} in project ${project}:`, error);
        if (error.code === 'ENOENT') {
            return res.status(404).json({ message: `File '${filename}' not found in project '${project}'.` });
        }
        res.status(500).json({ message: `Failed to read file '${filename}'` });
    }
});

// Route to save/create a file
app.post('/api/file', async (req, res) => {
    const { project, filename } = req.query;
    const { content } = req.body;

    if (!project || !filename) {
        return res.status(400).json({ message: 'Project and filename query parameters are required' });
    }
    if (content === undefined) {
        return res.status(400).json({ message: 'Content field in request body is required' });
    }

    // Basic path validation
    if (filename.includes('..')) {
        return res.status(400).json({ message: 'Invalid filename (path traversal detected).' });
    }

    const projectPath = path.join(projectsBaseDir, project);
    const filePath = path.join(projectPath, filename);

    try {
        // Ensure project directory exists
        await fs.mkdir(projectPath, { recursive: true });
        // Ensure subdirectory for the file exists if filename contains path segments
        const fileDir = path.dirname(filePath);
        if (fileDir !== projectPath) {
             await fs.mkdir(fileDir, { recursive: true });
        }

        await fs.writeFile(filePath, content, 'utf-8');
        res.json({ message: `File '${filename}' saved successfully in project '${project}'.` });
    } catch (error) {
        console.error(`Error writing file ${filename} in project ${project}:`, error);
        res.status(500).json({ message: `Failed to save file '${filename}'` });
    }
});

// Start the server
async function startServer() {
    await ensureProjectsBaseDirExists(); // Ensure base directory is checked/created before server starts
    app.listen(port, () => {
        console.log(`Server listening on http://localhost:${port}`);
    });
}

startServer().catch(err => {
    console.error("Failed to start server:", err);
});
