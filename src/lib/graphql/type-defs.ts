// GraphQL SDL for /api/graphql. Documented with examples in docs/API.md.
// Enum values are lowercase so they match the REST API and the database.

export const typeDefs = /* GraphQL */ `
  """ISO 8601 date-time, e.g. 2026-09-24T12:00:00.000Z"""
  scalar DateTime

  enum Priority {
    none
    urgent
    high
    medium
    low
  }

  enum StateType {
    triage
    backlog
    unstarted
    started
    completed
    canceled
  }

  enum ProjectRole {
    owner
    admin
    member
    guest
  }

  enum RelationType {
    blocks
    blocked_by
    related
    duplicate_of
    duplicated_by
  }

  type Query {
    "The user the API key / access token acts as."
    viewer: Viewer!
    "Projects the viewer is a member of."
    projects: [Project!]!
    "A project by id or key (e.g. APP). Null when missing or not a member."
    project(id: ID, key: String): Project
    "An issue by id or key (e.g. APP-12). Archived and trashed issues included."
    issue(id: ID, key: String): Issue
    "A project's issues, newest number first. Trashed issues never list."
    issues(projectId: ID!, filter: IssueFilter, first: Int = 50, after: String): IssueConnection!
    "Full-text search over titles, descriptions and comments of the viewer's projects."
    search(query: String!, projectId: ID, first: Int = 20): [Issue!]!
  }

  type Mutation {
    createIssue(input: IssueCreateInput!): Issue!
    "Pass id or key. Absent fields are untouched; null clears a field."
    updateIssue(id: ID, key: String, input: IssueUpdateInput!): Issue!
    archiveIssue(id: ID, key: String): Issue!
    "Moves the issue to the trash (restorable in the app)."
    deleteIssue(id: ID, key: String): Issue!
    createComment(input: CommentCreateInput!): Comment!
  }

  type Viewer {
    id: ID!
    name: String!
    email: String!
    image: String
    projects: [Project!]!
  }

  type User {
    id: ID!
    name: String!
    image: String
  }

  type Member {
    user: User!
    role: ProjectRole!
    joinedAt: DateTime!
  }

  type Project {
    id: ID!
    name: String!
    key: String!
    description: String
    icon: String
    color: String
    "The viewer's role."
    role: ProjectRole!
    triageEnabled: Boolean!
    cyclesEnabled: Boolean!
    estimateScale: String!
    states: [WorkflowState!]!
    labels: [Label!]!
    members: [Member!]!
    cycles: [Cycle!]!
    epics(includeArchived: Boolean = false): [Epic!]!
    issues(filter: IssueFilter, first: Int = 50, after: String): IssueConnection!
    createdAt: DateTime!
    url: String!
  }

  type WorkflowState {
    id: ID!
    name: String!
    type: StateType!
    color: String!
    position: Float!
    description: String
  }

  type Label {
    id: ID!
    name: String!
    color: String!
    description: String
  }

  type Cycle {
    id: ID!
    number: Int!
    name: String
    description: String
    startsAt: DateTime!
    endsAt: DateTime!
    completedAt: DateTime
  }

  type Epic {
    id: ID!
    projectId: ID!
    name: String!
    description: String
    color: String
    icon: String
    status: String!
    health: String
    lead: User
    startDate: String
    targetDate: String
    archivedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Issue {
    id: ID!
    key: String!
    number: Int!
    projectId: ID!
    project: Project!
    title: String!
    "Markdown."
    description: String
    state: WorkflowState!
    priority: Priority!
    estimate: Int
    "YYYY-MM-DD"
    startDate: String
    "YYYY-MM-DD"
    dueDate: String
    assignee: User
    creator: User
    labels: [Label!]!
    parent: Issue
    children: [Issue!]!
    cycle: Cycle
    epic: Epic
    milestoneId: ID
    comments: [Comment!]!
    relations: [IssueRelation!]!
    sortOrder: Float!
    githubBranch: String
    slaDueAt: DateTime
    slaBreachedAt: DateTime
    stateChangedAt: DateTime
    startedAt: DateTime
    completedAt: DateTime
    canceledAt: DateTime
    archivedAt: DateTime
    deletedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
    url: String!
  }

  type IssueRelation {
    id: ID!
    "Seen from the parent issue: blocks = this issue blocks \`issue\`."
    type: RelationType!
    issue: Issue!
  }

  type Comment {
    id: ID!
    issueId: ID!
    "Thread root for replies."
    parentId: ID
    "Markdown; mentions look like @[Name](user:USER_ID)."
    body: String!
    author: User
    createdAt: DateTime!
    editedAt: DateTime
  }

  type PageInfo {
    hasNextPage: Boolean!
    "Pass as \`after\` for the next page."
    endCursor: String
  }

  type IssueConnection {
    nodes: [Issue!]!
    pageInfo: PageInfo!
  }

  input IssueFilter {
    "State id, name or type."
    state: String
    "User id, 'me' or 'none'."
    assignee: String
    "Label id or name."
    label: String
    updatedSince: DateTime
    includeArchived: Boolean = false
  }

  input IssueCreateInput {
    projectId: ID!
    title: String!
    description: String
    stateId: ID
    priority: Priority
    estimate: Int
    startDate: String
    dueDate: String
    assigneeId: ID
    labelIds: [ID!]
    parentId: ID
    cycleId: ID
    epicId: ID
    milestoneId: ID
  }

  input IssueUpdateInput {
    title: String
    description: String
    stateId: ID
    priority: Priority
    estimate: Int
    startDate: String
    dueDate: String
    assigneeId: ID
    "Replaces the whole label set."
    labelIds: [ID!]
    "Adds labels, keeping the rest (not combinable with labelIds)."
    addLabelIds: [ID!]
    removeLabelIds: [ID!]
    parentId: ID
    cycleId: ID
    epicId: ID
    milestoneId: ID
    sortOrder: Float
  }

  input CommentCreateInput {
    "Issue id or key."
    issueId: ID
    issueKey: String
    body: String!
    "Reply in the thread of this comment."
    parentId: ID
  }
`;
