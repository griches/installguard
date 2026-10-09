// Well-known package names per registry: a name one edit away from one of these is flagged as a possible typosquat.

const NPM: readonly string[] = [
  'acorn', 'adm-zip', 'ai', 'ajv', 'alpinejs', 'angular', 'ansi-styles', 'apollo-client', 'apollo-server', 'archiver', 'astro',
  'async', 'autoprefixer', 'aws-sdk', 'axios', 'babel-loader', 'bcrypt', 'bcryptjs', 'better-sqlite3', 'biome', 'bl', 'bluebird',
  'body-parser', 'bootstrap', 'boxen', 'buffer', 'bunyan', 'bytes', 'canvas', 'chai', 'chalk', 'chart.js', 'cheerio', 'chokidar',
  'classnames', 'clsx', 'color', 'color-convert', 'colors', 'commander', 'concurrently', 'cookie-parser', 'core-js', 'cors',
  'cross-env', 'cross-fetch', 'crypto-js', 'css-loader', 'cssnano', 'csv-parse', 'cypress', 'd3', 'date-fns', 'dayjs', 'debug',
  'deepmerge', 'discord.js', 'dotenv', 'drizzle-orm', 'ejs', 'electron', 'electron-builder', 'elysia', 'esbuild', 'escape-html',
  'eslint', 'eslint-config-prettier', 'eslint-plugin-import', 'eslint-plugin-react', 'event-stream', 'execa', 'expo', 'express',
  'fast-xml-parser', 'fastify', 'file-loader', 'filesize', 'firebase', 'firebase-admin', 'form-data', 'formik', 'framer-motion',
  'fs-extra', 'gatsby', 'glob', 'googleapis', 'got', 'graceful-fs', 'graphql', 'handlebars', 'hapi', 'he', 'helmet',
  'highlight.js', 'hono', 'html-webpack-plugin', 'htmx.org', 'husky', 'iconv-lite', 'immer', 'inherits', 'ini', 'inquirer',
  'ioredis', 'is-number', 'is-odd', 'isomorphic-fetch', 'jest', 'jimp', 'joi', 'jose', 'jotai', 'jquery', 'js-yaml', 'jsdom',
  'jsonwebtoken', 'jszip', 'kleur', 'knex', 'koa', 'langchain', 'left-pad', 'lerna', 'less', 'lint-staged', 'lit', 'lodash',
  'lodash.debounce', 'lodash.get', 'lodash.merge', 'log4js', 'loglevel', 'lru-cache', 'lucide-react', 'luxon', 'markdown-it',
  'marked', 'mime', 'mime-types', 'mini-css-extract-plugin', 'minimatch', 'minimist', 'mkdirp', 'mobx', 'mocha', 'moment',
  'mongodb', 'mongoose', 'morgan', 'ms', 'msw', 'multer', 'mustache', 'mysql', 'mysql2', 'nanoid', 'nest', 'next', 'nock',
  'node-cache', 'node-fetch', 'nodemailer', 'nodemon', 'npm-run-all', 'nunjucks', 'nuxt', 'nx', 'object-assign', 'openai', 'ora',
  'oxlint', 'p-limit', 'p-map', 'p-queue', 'papaparse', 'parcel', 'passport', 'pdfkit', 'pg', 'picocolors', 'pify', 'pino',
  'playwright', 'pm2', 'postcss', 'preact', 'prettier', 'pretty-ms', 'prisma', 'prismjs', 'pug', 'puppeteer', 'q', 'qs',
  'query-string', 'quick-lru', 'ramda', 'react', 'react-dom', 'react-hook-form', 'react-native', 'react-query', 'react-redux',
  'react-router', 'react-router-dom', 'readable-stream', 'recharts', 'redis', 'redux', 'regenerator-runtime', 'remix', 'request',
  'restify', 'rimraf', 'rollup', 'rxjs', 'safe-buffer', 'sass', 'selenium-webdriver', 'semver', 'sentry', 'sequelize', 'sharp',
  'shelljs', 'sinon', 'socket.io', 'socket.io-client', 'solid-js', 'source-map', 'source-map-support', 'sqlite3', 'storybook',
  'string-width', 'strip-ansi', 'stripe', 'style-loader', 'styled-components', 'stylelint', 'superagent', 'supertest',
  'supports-color', 'svelte', 'swr', 'tailwindcss', 'tar', 'telegraf', 'terser', 'three', 'through2', 'toml', 'trpc', 'ts-jest',
  'ts-loader', 'ts-node', 'tslib', 'tsup', 'tsx', 'turbo', 'twilio', 'typeorm', 'typescript', 'uglify-js', 'unbuild', 'underscore',
  'undici', 'unzipper', 'url-loader', 'urql', 'util-deprecate', 'uuid', 'validator', 'vite', 'vite-plugin-react', 'vitest', 'vue',
  'webpack', 'webpack-cli', 'webpack-dev-server', 'winston', 'wrap-ansi', 'ws', 'xlsx', 'xml2js', 'yaml', 'yargs', 'yauzl', 'yup',
  'zod', 'zustand', 'zx',
]

const PYPI: readonly string[] = [
  'aiohttp', 'alembic', 'altair', 'ansible', 'anthropic', 'apscheduler', 'arrow', 'asyncpg', 'attrs', 'autopep8', 'awscli',
  'azure-identity', 'azure-storage-blob', 'backoff', 'bandit', 'bcrypt', 'beautifulsoup4', 'black', 'bokeh', 'boto3', 'botocore',
  'bottle', 'build', 'cachetools', 'catboost', 'celery', 'certifi', 'chardet', 'charset-normalizer', 'click', 'colorama',
  'confluent-kafka', 'coverage', 'cryptography', 'cython', 'dash', 'dask', 'dataclasses-json', 'datasets', 'decorator', 'decouple',
  'discord.py', 'diskcache', 'distlib', 'django', 'docker', 'ecdsa', 'email-validator', 'environs', 'fabric', 'factory-boy',
  'faker', 'fastapi', 'filelock', 'flake8', 'flask', 'gensim', 'google-api-python-client', 'google-cloud-storage', 'gradio',
  'grpcio', 'gunicorn', 'hatch', 'html5lib', 'httpcore', 'httpx', 'huggingface-hub', 'hypothesis', 'idna', 'imageio',
  'importlib-metadata', 'ipykernel', 'ipython', 'isort', 'itsdangerous', 'jax', 'jinja2', 'joblib', 'jsonschema', 'jupyter',
  'jupyterlab', 'kafka-python', 'keras', 'kivy', 'kubernetes', 'langchain', 'lightgbm', 'loguru', 'lxml', 'mako', 'markupsafe',
  'marshmallow', 'matplotlib', 'mock', 'more-itertools', 'motor', 'msgpack', 'mypy', 'mysqlclient', 'nbconvert', 'networkx',
  'nltk', 'notebook', 'nox', 'numba', 'numpy', 'oauthlib', 'openai', 'opencv-python', 'openpyxl', 'orjson', 'packaging', 'pandas',
  'paramiko', 'passlib', 'peewee', 'pendulum', 'pika', 'pillow', 'pip', 'pipenv', 'platformdirs', 'playwright', 'plotly', 'ply',
  'poetry', 'polars', 'pre-commit', 'prettytable', 'protobuf', 'psutil', 'psycopg2', 'psycopg2-binary', 'pyarrow', 'pycryptodome',
  'pydantic', 'pydantic-core', 'pygame', 'pyjwt', 'pylint', 'pymongo', 'pymysql', 'pynacl', 'pyopenssl', 'pyparsing', 'pyqt5',
  'pyramid', 'pyserial', 'pytest', 'pytest-asyncio', 'pytest-cov', 'pytest-mock', 'python-dateutil', 'python-dotenv',
  'python-multipart', 'python-telegram-bot', 'pytz', 'pyyaml', 'pyzmq', 'redis', 'regex', 'requests', 'requests-oauthlib', 'rich',
  'rsa', 'ruff', 's3transfer', 'sanic', 'schedule', 'scikit-image', 'scikit-learn', 'scipy', 'scrapy', 'seaborn', 'selenium',
  'sendgrid', 'sentence-transformers', 'sentry-sdk', 'setuptools', 'simplejson', 'six', 'slack-sdk', 'spacy', 'sqlalchemy',
  'starlette', 'statsmodels', 'streamlit', 'stripe', 'structlog', 'sympy', 'tabulate', 'tenacity', 'tensorflow', 'termcolor',
  'thrift', 'tiktoken', 'tkinter', 'tokenizers', 'toml', 'tomli', 'torch', 'torchvision', 'tornado', 'tortoise-orm', 'tox', 'tqdm',
  'transformers', 'tweepy', 'twilio', 'twine', 'typer', 'typing-extensions', 'tzdata', 'ujson', 'urllib3', 'uv', 'uvicorn',
  'virtualenv', 'watchdog', 'websocket-client', 'websockets', 'werkzeug', 'wheel', 'wrapt', 'xgboost', 'xlrd', 'xlsxwriter',
  'yapf', 'zipp',
]

const CRATES: readonly string[] = [
  'actix-web', 'ahash', 'anyhow', 'askama', 'async-std', 'async-trait', 'axum', 'base64', 'bat', 'bevy', 'bincode', 'bitflags',
  'bytes', 'cargo-edit', 'cargo-watch', 'cc', 'cfg-if', 'chrono', 'clap', 'colored', 'crossbeam', 'crossterm', 'csv', 'dashmap',
  'derive_more', 'diesel', 'dirs', 'either', 'env_logger', 'fd-find', 'futures', 'glob', 'handlebars', 'hashbrown', 'hex', 'http',
  'hyper', 'image', 'indexmap', 'indicatif', 'itertools', 'js-sys', 'lazy_static', 'libc', 'log', 'memchr', 'mongodb',
  'native-tls', 'nom', 'num', 'num-traits', 'once_cell', 'openssl', 'parking_lot', 'pest', 'pin-project', 'proc-macro2', 'prost',
  'quote', 'rand', 'ratatui', 'rayon', 'redis', 'regex', 'reqwest', 'ring', 'ripgrep', 'rocket', 'rusqlite', 'rustls', 'sea-orm',
  'semver', 'serde', 'serde_derive', 'serde_json', 'serde_yaml', 'sha2', 'smallvec', 'sqlx', 'structopt', 'strum', 'syn', 'tauri',
  'tempfile', 'tera', 'thiserror', 'time', 'tokio', 'toml', 'tonic', 'tower', 'tracing', 'url', 'uuid', 'walkdir', 'warp',
  'wasm-bindgen', 'web-sys', 'wgpu',
]

const RUBYGEMS: readonly string[] = [
  'activerecord', 'activesupport', 'aws-sdk', 'bootsnap', 'bundler', 'byebug', 'capybara', 'cocoapods', 'devise', 'dotenv',
  'factory_bot', 'faker', 'faraday', 'fastlane', 'httparty', 'jekyll', 'json', 'minitest', 'mysql2', 'nokogiri', 'pg', 'pry',
  'puma', 'rack', 'rails', 'rake', 'redis', 'rspec', 'rubocop', 'sass', 'sidekiq', 'sinatra', 'sprockets', 'sqlite3', 'stripe',
  'thor', 'turbo-rails', 'webpacker', 'xcpretty',
]

export const POPULAR = { npm: NPM, pypi: PYPI, crates: CRATES, rubygems: RUBYGEMS } as const
