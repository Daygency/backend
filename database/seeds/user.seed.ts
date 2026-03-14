import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { DataSource } from 'typeorm';
import { User } from '../../src/apis/user/entities/user.entity';
import { Major } from '../../src/apis/user/entities/major.entity';

export default class UserSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    const userRepository = dataSource.getRepository(User);
    const majorRepository = dataSource.getRepository(Major);

    const existing = await userRepository.count();
    if (existing > 0) {
      return;
    }

    const majors = await majorRepository.find();
    if (majors.length === 0) {
      return;
    }

    const userFactory = factoryManager.get(User);

    const users: User[] = [];
    for (let i = 0; i < 20; i++) {
      const major = majors[Math.floor(Math.random() * majors.length)];
      const user = await userFactory.make({ major });
      users.push(user);
    }

    await userRepository.save(users);
  }
}
