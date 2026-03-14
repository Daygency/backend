import { Seeder } from 'typeorm-extension';
import { DataSource } from 'typeorm';
import { Major } from '../../src/apis/user/entities/major.entity';
import { MAJOR_OPTIONS } from '../../src/apis/common/constant';

export default class MajorSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    // _factoryManager: SeederFactoryManager,
  ): Promise<void> {
    const majorRepository = dataSource.getRepository(Major);

    const existing = await majorRepository.count();
    if (existing > 0) {
      return;
    }

    const majors = MAJOR_OPTIONS.map((name) => {
      const major = new Major();
      major.name = name;
      return major;
    });

    await majorRepository.save(majors);
  }
}
