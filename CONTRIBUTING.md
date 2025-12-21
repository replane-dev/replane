# Contributing to Replane

Thank you for your interest in contributing to Replane! This guide will help you get started.

## Getting Started

### Prerequisites

- **Node.js**: Version 22.0.0 or greater (specified in `package.json` engines)
- **pnpm**: Version 10.7.0 or greater (check with `pnpm --version`)

### Clone the Repository

```sh
git clone https://github.com/replane-dev/replane.git
cd replane
```

### Install Dependencies

```sh
pnpm install
```

### Environment Setup

Before running the app, configure the required environment variables. Create a `.env` file in the project root (see `.env.example`):

```sh
BASE_URL=http://localhost:3000
SECRET_KEY=your-development-secret-key
DATABASE_URL=postgresql://user:pass@host:5432/replane
```

See [Environment variables](README.md#environment-variables) in the README for all available options.

### Development

Start the development server:

```sh
pnpm dev
```

### Production Build

Build the application for production:

```sh
pnpm build
```

Run migrations and start the server:

```sh
pnpm migrate
pnpm start
```

## Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run tests and linting to ensure everything passes
5. Commit your changes with a descriptive message
6. Push to your fork and submit a pull request

## Reporting Issues

Found a bug or have a feature request? Please [open an issue](https://github.com/replane-dev/replane/issues) on GitHub.

## Community

Have questions or want to discuss Replane? Join the conversation in [GitHub Discussions](https://github.com/orgs/replane-dev/discussions).

## License

By contributing to Replane, you agree that your contributions will be licensed under the MIT License.
