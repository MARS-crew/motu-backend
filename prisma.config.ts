import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // generate는 DB 접속이 필요 없어서 값이 없어도 동작한다.
    url: process.env.DATABASE_URL,
  },
});
