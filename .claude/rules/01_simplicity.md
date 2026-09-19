# Rule 01 - Simplicity

## Guiding Concepts

- "Perfection is achieved, not when there is nothing more to add, but when there is nothing more to take away."
- "Premature optimization is the root of all evil."
- "Keep It Simple, Stupid."

## Instructions:

- Always look for the most direct change that accomplishes a goal.
- It is better to build things incrementally than to over-engineer a solution that requires a refactor down the line.
- Don't prematurely generalize a solution to a problem before it is needed.
- New abstractions, such as files or functions, should only be created when they are needed in multiple locations.
- Keep the agent output simple and concise. Don't go in-depth unless asked by the user to elaborate.

## Language-specific Instructions

Typescript:

- Use immediately invoked function expressions (IIFEs) where possible. Don't create a new function unless it is needed in multiple locations. Prefer the arrow variable syntax for IIFEs, as it is more concise and easier to read.
