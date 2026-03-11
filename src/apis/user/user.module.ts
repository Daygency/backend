import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './services/user.service';
import { UserController } from './controllers/user.controller';
import { User } from './entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { PortfolioService } from './services/portfolio.service';
import { Award } from './entities/award.entity';
import { Career } from './entities/career.entity';
import { Education } from './entities/education.entity';
import { Certificate } from './entities/certificate.entity';
import { Major } from './entities/major.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Award,
      Career,
      Education,
      Certificate,
      Major,
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [UserController],
  providers: [UserService, PortfolioService],
  exports: [UserService],
})
export class UserModule {}
