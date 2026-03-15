import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnnouncementCategory } from '../apis/announcement/entities/announcement-category.entity';
import { Major } from '../apis/major/entities/major.entity';
import { ANNOUNCEMENT_CATEGORY_OPTIONS, MAJOR_OPTIONS } from './constant';

@Injectable()
export class DatabaseSeedService implements OnModuleInit {
  constructor(
    @InjectRepository(AnnouncementCategory)
    private readonly announcementCategoryRepo: Repository<AnnouncementCategory>,
    @InjectRepository(Major)
    private readonly majorRepo: Repository<Major>,
  ) {}

  async onModuleInit() {
    await this.seedAnnouncementCategories();
    await this.seedMajors();
  }

  private async seedAnnouncementCategories() {
    const existing = await this.announcementCategoryRepo.count();
    if (existing > 0) return;

    const categories = ANNOUNCEMENT_CATEGORY_OPTIONS.map((name) => {
      const category = new AnnouncementCategory();
      category.name = name;
      return category;
    });
    await this.announcementCategoryRepo.save(categories);
  }

  private async seedMajors() {
    const existing = await this.majorRepo.count();
    if (existing > 0) return;

    const majors = MAJOR_OPTIONS.map((name) => {
      const major = new Major();
      major.name = name;
      return major;
    });
    await this.majorRepo.save(majors);
  }
}
