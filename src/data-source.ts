import 'dotenv/config';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import type { SeederOptions } from 'typeorm-extension';

const options: DataSourceOptions & SeederOptions = {
  type: process.env.DATABASE_TYPE as 'mysql',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '3306'),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  synchronize: true,
  logging: true,
  entities: ['src/**/*.entity{.ts,.js}'],
  seeds: ['database/seeds/**/*{.ts,.js}'],
  factories: ['database/factories/**/*{.ts,.js}'],
};

export const AppDataSource = new DataSource(options);

export default AppDataSource;
