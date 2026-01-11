/**
 * Workspace Onboarding Prompt
 * AI-driven conversation to help users set up their workspace organization
 */

export const WORKSPACE_SETUP_PROMPT = `Help me set up this workspace as my personal productivity system. Please guide me through setting up a folder structure that works for my needs.

Ask me about:

1. **My primary use case** - What kind of work will I be doing? (research, writing, project management, coding, personal knowledge management, client work, etc.)

2. **Organization style preference** - Do I prefer:
   - Numbered folders (00-Inbox, 01-Active, 02-Archive) for clear ordering?
   - Category-based folders (Projects, Notes, Resources)?
   - PARA method (Projects, Areas, Resources, Archive)?
   - Something else?

3. **Task management** - How should tasks be organized?
   - A central tasks folder with individual task files?
   - Tasks embedded within project folders?
   - A single tasks.md file?

4. **Templates** - What templates would be useful? (meeting notes, project kickoff, daily log, weekly review, etc.)

After gathering my preferences, create the folder structure and any starter files using the file tools. Include a README.md explaining the system.

**Important**: After creating the structure, tell me to go to Settings > Task Sources and configure my task folder path so the Tasks panel shows only relevant tasks.`

/**
 * Short prompt for users who want quick setup without questions
 */
export const QUICK_SETUP_PROMPT = `Create a professional productivity workspace with the following structure:

- 00-Inbox/ (capture new items)
- 01-Active/
  - tasks/ (active task files)
  - projects/ (current projects)
- 02-Someday/ (deferred items)
- 03-Reference/ (reference materials)
- 04-Archive/ (completed work)
- Templates/ (reusable templates)
- README.md (workspace guide)

Please create this folder structure now, including:
1. The folders listed above
2. A README.md explaining how to use each folder
3. A sample task template in Templates/

After creation, remind me to configure Settings > Task Sources to point to "01-Active/tasks" for the Tasks panel.`
