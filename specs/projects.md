# Projects Functionality - Comprehensive Test Plan

## Application Overview

The Projects feature allows users to create, configure, and manage AI chatbot projects with custom settings. Each project includes:

- **Project Title**: A unique name for identification
- **AI Model Selection**: Choice of available language models (e.g., Kimi K2, Llama models)
- **System Prompt**: Custom instructions for the AI assistant using markdown editor
- **Tool Configuration**: Enable/disable tools like RAG (Retrieval-Augmented Generation), Web Search, and Refine Prompt
- **Advanced Settings**: Temperature control for response creativity, and tool-specific configurations (e.g., RAG Max Resources)
- **Test Chat**: Integrated chat interface for testing project configurations without saving changes
- **Project Management**: Edit, delete, and navigate between project chats

Projects are displayed in the sidebar with expandable options for starting chats, editing settings, or deletion. The system supports both permanent and temporary chat sessions.

## Page Objects Architecture

### ProjectPage
A new Page Object for handling project creation and editing views:
- Located at `tests/e2e/project/pages/project.page.ts`
- Composes ProjectFormComponent and ChatComponent
- Methods: `gotoAdd()`, `gotoEdit(projectId)`, `saveProject()`, `testChat()`

### Component Objects Identified
- **ProjectFormComponent**: Handles the project configuration form (title, model, prompt, tools, settings)
- **ProjectListComponent**: Manages the projects list in sidebar with expand/collapse functionality
- **ChatComponent**: Embedded chat interface for testing project configurations. Use existing ChatComponent (tests/e2e/chat/components/chat.ts) from chat tests.

## Test Scenarios

### 1. Creating a New Project

#### 1.1 Create Project with Minimum Valid Data
**Steps:**
1. Navigate to Projects section in sidebar
2. Click "Projects" heading link to access /project/add
3. Enter "Test Project" in the Title field
4. Select "Kimi K2" from the Model dropdown
5. Enter "You are a helpful assistant." in the System Prompt editor
6. Click "Save Project" button

**Expected Results:**
- Success notification appears: "Project created successfully!"
- User is redirected to the home page
- "Test Project" appears in the Projects list in sidebar
- Project is expandable showing Start Chat, Temporary Chat, Edit, and Delete options

#### 1.2 Create Project with All Tools Enabled
**Steps:**
1. Navigate to /project/add
2. Fill Title: "Full Featured Project"
3. Select Model: "Llama 4 Scout"
4. Enter System Prompt: "You are an expert assistant with access to tools."
5. Check "RAG" tool checkbox
6. Check "Web Search" tool checkbox
7. Check "Refine Prompt" tool checkbox
8. Expand "Advanced" section
9. Set Temperature to 0.8
10. Verify "RAG Max Resources" appears and set to 10
11. Click "Save Project"

**Expected Results:**
- Project saves successfully
- All selected tools are configured
- Advanced settings are preserved
- Tool-specific configurations (RAG Max Resources) are saved

#### 1.3 Attempt to Create Project with Empty Title
**Steps:**
1. Navigate to /project/add
2. Leave Title field empty
3. Fill other required fields (Model, System Prompt)
4. Click "Save Project"

**Expected Results:**
- Save operation fails
- Validation error appears for empty title field
- Form remains on page with entered data preserved
- No new project is created

#### 1.4 Create Project with Very Long Title
**Steps:**
1. Navigate to /project/add
2. Enter a title with 200+ characters
3. Fill other fields normally
4. Click "Save Project"

**Expected Results:**
- Project saves successfully if title length is supported
- Title displays properly in sidebar (truncated if necessary)
- Full title is preserved in project settings

### 2. Editing Existing Projects

#### 2.1 Edit Project Basic Settings
**Steps:**
1. Expand "Test Project" in sidebar
2. Click "Edit" option
3. Change Title to "Updated Test Project"
4. Change Model to "Llama 4 Scout"
5. Modify System Prompt
6. Click "Save Project"

**Expected Results:**
- Changes save successfully
- Success notification appears
- Updated project name appears in sidebar
- Changes persist when accessing project again

#### 2.2 Test Chat Functionality in Edit Mode
**Steps:**
1. Navigate to project edit page
2. Click "Test Chat" tab
3. Enter "Hello, test message" in chat input
4. Click "Send message"

**Expected Results:**
- Message sends successfully
- AI responds using current project configuration
- Response includes model information and settings
- Chat history displays user and assistant messages
- Changes made in test chat do not affect saved project

#### 2.3 Modify Tool Configuration
**Steps:**
1. In edit mode, uncheck "RAG" tool
2. Check "Web Search" tool
3. Adjust Temperature to 0.3
4. Click "Save Project"

**Expected Results:**
- Tool settings update successfully
- Advanced configurations update accordingly
- Changes reflect in subsequent test chats

### 3. Project Navigation and Management

#### 3.1 Start Permanent Chat from Project
**Steps:**
1. Expand project in sidebar
2. Click "Start Chat" option

**Expected Results:**
- Navigates to /project/{id}/chat
- Chat interface loads with project configuration
- System prompt and tools are active
- Chat persists in chat history

#### 3.2 Start Temporary Chat from Project
**Steps:**
1. Expand project in sidebar
2. Click "Temporary Chat" option

**Expected Results:**
- Navigates to /project/{id}/chat?chatType=temporary
- Chat interface loads with project configuration
- Chat is marked as temporary (may not persist)

#### 3.3 Delete Project
**Steps:**
1. Expand project in sidebar
2. Click "Delete" button
3. Confirm deletion in modal

**Expected Results:**
- Project is removed from sidebar
- Associated chats may be affected (confirm behavior)
- Success notification appears
- Cannot access project edit page anymore

### 4. Edge Cases and Error Handling

#### 4.1 Handle Network Errors During Save
**Steps:**
1. Fill project form
2. Simulate network disconnection (if testable)
3. Click "Save Project"

**Expected Results:**
- Appropriate error message displays
- Form data is preserved
- User can retry save operation

#### 4.2 Concurrent Project Editing
**Steps:**
1. Open project edit in one tab
2. Open same project edit in another tab
3. Make changes in first tab and save
4. Try to save changes in second tab

**Expected Results:**
- Conflict resolution or appropriate error handling
- Data integrity maintained

#### 4.3 Invalid Markdown in System Prompt
**Steps:**
1. Enter malformed markdown in System Prompt
2. Save project
3. Test chat with the project

**Expected Results:**
- Markdown renders correctly or handles errors gracefully
- Chat functionality works despite markdown issues

### 5. Responsive Design and Accessibility

#### 5.1 Mobile Responsiveness
**Steps:**
1. Resize browser to mobile dimensions
2. Navigate through project creation and editing
3. Test sidebar interactions

**Expected Results:**
- All elements remain accessible
- Forms are usable on small screens
- Sidebar collapses appropriately

#### 5.2 Keyboard Navigation
**Steps:**
1. Use Tab key to navigate form fields
2. Use Enter to submit forms
3. Use Space/Enter for checkboxes and buttons

**Expected Results:**
- Full keyboard accessibility
- Logical tab order
- Screen reader compatibility

## Success Criteria

- All CRUD operations (Create, Read, Update, Delete) work correctly
- Form validations prevent invalid data
- UI remains responsive across devices
- Error states are handled gracefully
- Test chat accurately reflects project configuration
- Sidebar navigation is intuitive and functional
