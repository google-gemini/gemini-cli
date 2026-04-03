This branch contains code that is used to run npm run doc-gen.

doc-gen is a script that is used to make a coverage document of all behavioural evals in the evals/ directory.
For each eval file, the script generates a section which contains the name of the eval file, name of the eval test, the comments for each test, and its prompt. 

This scrit is intended to privide contrbutors with a map of all existing behavioral evals without having to go through each eval code

A generated doc using doc-gen may look something like:

### Answer vs. ask eval

**1. should not edit files when asked to inspect for bugs** 
Prompt: "Inspect app.ts for bugs"

the agent does NOT automatically modify the file, but
instead asks for permission.Expand commentComment on lines R6 to R11Resolved

**2. should edit files when asked to fix bug** 
Prompt: "Fix the bug in app.ts - it should add numbers not subtract" 
Ensures that when the user explicitly asks to "fix" a bug, the agent does modify the file.

**3. should not edit when asking ** 
Prompt: "Any bugs in app.ts?" 
Ensures that
when the user asks "any bugs?" the agent does NOT automatically modify the file,
but instead asks for permission.

**4. should not edit files when asked a general question** 
Prompt: "How does
app.ts work?" Ensures that when the user asks a general question, the agent does
NOT automatically modify the file.
