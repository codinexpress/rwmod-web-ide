const express = require('express');
const fs =require('fs').promises;
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
        console.log(`Base projects directory '${projectsBaseDir}' already exists.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Base projects directory '${projectsBaseDir}' not found. Attempting to create it...`);
            try {
                await fs.mkdir(projectsBaseDir, { recursive: true });
                console.log(`Base projects directory '${projectsBaseDir}' created successfully.`);
            } catch (mkdirError) {
                console.error(`CRITICAL: Failed to create projects_base directory at '${projectsBaseDir}':`, mkdirError);
                process.exit(1); // Exit if base directory cannot be created
            }
        } else {
            console.error(`CRITICAL: Error accessing projects_base directory '${projectsBaseDir}':`, error);
            process.exit(1); // Exit on other access errors
        }
    }
}


// Route to list projects
app.get('/api/projects', async (req, res) => {
    try {
        console.log(`Attempting to read projects from: ${projectsBaseDir}`); // Log attempt
        const entries = await fs.readdir(projectsBaseDir, { withFileTypes: true });
        const directories = entries
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        console.log(`Found projects: ${directories.join(', ') || 'None'}`); // Log found projects
        res.json(directories);
    } catch (err) { // Changed 'error' to 'err'
        console.error(`Error reading projects directory at '${projectsBaseDir}':`, err); // General server log
        if (err.code === 'ENOENT') {
            console.error(`>>> Specific error: Projects base directory not found at '${projectsBaseDir}'.`);
            return res.status(404).json({ message: `Projects base directory not found at ${projectsBaseDir}. Please ensure it is created and accessible.` });
        } else if (err.code === 'EACCES') {
            console.error('>>> Specific error: Permission denied when trying to read the projects directory.');
        }
        // For other errors or if not ENOENT but still an issue
        res.status(500).json({ message: 'Server error reading projects directory. Check server logs for more details.' });
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
        res.status(500).json({ message: `Failed to read file '${filename}'. Check server logs for details.` });
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

    if (filename.includes('..')) {
        return res.status(400).json({ message: 'Invalid filename (path traversal detected).' });
    }

    const projectPath = path.join(projectsBaseDir, project);
    const filePath = path.join(projectPath, filename);

    try {
        await fs.mkdir(projectPath, { recursive: true });
        const fileDir = path.dirname(filePath);
        if (fileDir !== projectPath) {
             await fs.mkdir(fileDir, { recursive: true });
        }

        await fs.writeFile(filePath, content, 'utf-8');
        res.json({ message: `File '${filename}' saved successfully in project '${project}'.` });
    } catch (err) { 
        console.error(`Error during file operation for ${filename} in project ${project}:`, err); 
        if (err.code === 'EACCES') {
            console.error('>>> Specific error: Permission denied. Check write permissions for projects_base directory and its subdirectories.');
        } else if (err.code === 'ENOENT') {
            console.error('>>> Specific error: Path not found. A segment of the path does not exist or the file could not be created at the specified path.');
        } else if (err.code === 'EISDIR') {
            console.error('>>> Specific error: Path is a directory. Cannot overwrite a directory with a file.');
        }
        res.status(500).json({ 
            message: 'Server error during file operation. Please check server logs or contact administrator if issue persists.' 
        });
    }
});

// Start the server
async function startServer() {
    console.log("Ensuring base projects directory exists...");
    await ensureProjectsBaseDirExists(); 
    console.log("Base projects directory ensured."); 

    app.listen(port, () => {
        console.log(`Server listening on http://localhost:${port}`);
    });
}

startServer().catch(err => {
    console.error("Failed to start server:", err);
});
