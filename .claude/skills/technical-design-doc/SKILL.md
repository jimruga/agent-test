---
name: technical-design-doc
description: Create a technical design doc for a project.
disable-model-invocation: true
---

This skill creates a Technical Design Document:

# Process

1. Find the PRD from the context, or ask for the PRD. Read the PRD and use it to inform your technical designs.

2. Find the Claude Design project from the conversation context, or ask for the Claude Design project. Fetch the project and use it to inform your technical design.

3. Explore the repo to understand the current state of the codebase, if you haven't already. If you can't find the repo ask the user for its location.

4. Based on the PRD, the Claude Design, and any available codebase, fill out the sections in the template below. Do not make assumptions - if criteria are missing, ask the user for further detail. Not all sections will always have content - keep all sections, but note that there is no relevant information when applicable. Use the project's domain glossary (`CONTEXT.md`) vocabulary throughout the technical design document, and respect any ADRs (`/docs/adr`) in the area you're touching.

5. Write the technical design document to a markdown file within the docs/tdds folder of this repository. The file name should be in the format of the feature's name with spaces replaced with underscores, followed by "_tdd". Example: Saved_Search_Alerts_tdd.md

<tdd-template>

## Overview

In 2-3 sentences describe the problem you’re trying to solve and the context.

Link the Claude Design project in this section as well.

## Design Goals

What are you trying to achieve with this technical design?

Write a short paragraph to describe the outcome you are trying to achieve.

- Is this intended to be a core, reusable system?
- Is this intended to narrowly support a product feature and not be generalized?

## Use Cases

What are users of your system trying to accomplish?

Use a numbered list, one per use case. The use case should be 1-2 sentences describing one thing a user is trying to accomplish with your system.

If use cases are already in a separate document, provide a link to that document instead.

## Solution Summary

Describe your approach in detail and any high-level tradeoffs you want to make. The idea here is to capture what the new system is intended to do and how it does it.

## Details

Show or describe how the solution would work in detail. Please use mermaid diagrams if applicable.

Include any or all the following needed:

1. New core objects or changes to objects
2. Detailed description of any non-trivial business logic.
3. Changes to states of objects that affect business logic, such as states that allow / disallow user actions

### Systems Diagram

If you are adding interactions between services / systems, include a mermaid diagram showing those interactions as a data flow diagram.

### Artifical Intelligence Interfaces

If you plan on using an AI to evaluate or analyze data in any way, make certain you have documented any PII or Senstive Information data that is to be shared with the AI.

### System Interfaces

If you are changing an interface to another system (including Mulesoft, Twilio, Odoo, Salesforce, Marketo, or Netsuite), document the new payload or API interface for that system.

Use different colors to highlight the change in the interface.

If there are breaking changes, please increment the version and describe the plan to migrate off of the old version.

Put interface specifications in a collapsable code block.

### Database Changes

If you are changing database schemas (including primary keys, indices, and column definitions such as data type and nullable / non-nullable), document the changes in the Data Definition Language format.

Use different colors to highlight the change in the interface.

Put DDL definitions in a collapsable code block.

### Scalability

Describe the expected usage and scaling characteristics of your solution.

Estimate the expected throughput of the system / endpoints (in requests / second)

Given the estimate, do you foresee any resource constraints:

- Network throughput / latency? Will you need to transfer large files?
- CPU? Will you need to do expensive computation?
- Memory? Will you pull large data sets and / or cache data in memory?
- Database connections? Will you make a large number of queries to the database?
- Database table size? Will you be storing wide columns (lots of JSON) or a large number of rows in a table?
- Third-party API limits? Will you be hitting a third-party service? What are its rate limits and / or costs per query?

For each of the above, use your throughput forecast to estimate the impact to the resource constraint (how long do we have until the system tips over), and what risk mitigation measures we have.

### Operationalization

Describe any new system resources (databases, lambdas, etc) that need to be set up.

- Will the system be shared across environments in dev?
- Can the system be designed so that it doesn’t know what environment it’s running in?

### Monitoring/Alerting

Describe any new monitors Sentry, Datadog or PagerDuty alerts that need to be set up

### Security/Privacy

Describe any security considerations for this design.

- What sensitive data will this system handle?
  - Customer CAD files or other customer intellectual property (SOC2, NIST)
  - Customer secured data such as credit card numbers or passwords (PCI)
  - Personally Identifiable Information (PII) such as names, addresses, phone numbers, or IP addresses (SOC2)
  - Financial information, such as customer specific pricing or pricing algorithms (SOX)
- How is that data protected in transit and at rest?
- Who (what roles) have permissions to access and change that data?
- What audit logs will this system record for access to that data?
- If there are other access control roles, describe them and why they exist

### Open Source Libraries

List any open source libraries added in your project

- Include a link to the repository for the library
- Include a link to the license

</tdd-template>
