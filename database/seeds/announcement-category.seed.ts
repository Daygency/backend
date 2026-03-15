import { Seeder } from 'typeorm-extension';
import { DataSource } from 'typeorm';
import { AnnouncementCategory } from '../../src/apis/announcement/entities/announcement-category.entity';
import { ANNOUNCEMENT_CATEGORY_OPTIONS } from '../../src/common/constant';

export default class AnnouncementCategorySeeder implements Seeder {
  public async run(dataSource: DataSource): Promise<void> {
    const categoryRepository = dataSource.getRepository(AnnouncementCategory);

    const existing = await categoryRepository.count();
    if (existing > 0) {
      return;
    }

    const categories = ANNOUNCEMENT_CATEGORY_OPTIONS.map((name) => {
      const category = new AnnouncementCategory();
      category.name = name;
      return category;
    });

    await categoryRepository.save(categories);
  }
}
