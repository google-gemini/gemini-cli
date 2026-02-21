# Writing helpful error messages

Bad error messages frustrate users. Good error messages provide critical
information when things are not working as expected. Error messages are often
the main way developers interact with users when problems occur. Some error
messages are caused by invalid user inputs or misuse of certain features and
some are caused by product defects; all error messages require users to figure
out what to do next.

Great error messages answer two questions as clearly and concisely as possible: 

1. What went wrong? 
2. How can I fix it?

## Principles

- Write concise error messages. Emphasize what's important. Cut unnecessary
  text.
- Avoid double negatives. Readers find double negatives hard to parse. 
- Converting from passive voice to active voice often makes sentences conciser
  and easier to understand.
- Use terminology consistently for all error messages within a single feature.

## Be positive

- Instead of telling the user what they did wrong, tell the user how to get it
  right.
- While maintaining positivity, avoid the words "sorry" or "please." Focus
  instead on clearly describing the problem and solution.

## Avoid humor

Don't attempt to make error messages humorous. Humor in error messages can fail
for the following reasons:

- Errors frustrate users. Angry users are generally not receptive to humor.
- Users can misinterpret humor. (Jokes don't always cross borders well.)
- Humor can detract from the goal of the error message.

## Don't blame the user

If possible, focus the error message on what went wrong rather than assigning
blame.

