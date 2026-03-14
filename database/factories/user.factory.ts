import { setSeederFactory } from 'typeorm-extension';
import {
  SocialProvider,
  User,
  UserRole,
} from '../../src/apis/user/entities/user.entity';

export default setSeederFactory(User, (faker) => {
  const user = new User();

  const nickname = faker.internet.username().slice(0, 20);
  const activityName = faker.internet.username().slice(0, 20);

  user.nickname = nickname;
  user.activityName = activityName;
  user.aboutMe = faker.lorem.sentence().slice(0, 100);
  user.selfIntroduction = faker.lorem.paragraph().slice(0, 300);
  user.role = UserRole.USER;
  user.email = faker.internet.email();
  user.phoneNumber = `010-${faker.number
    .int({ min: 1000, max: 9999 })
    .toString()}-${faker.number.int({ min: 1000, max: 9999 }).toString()}`;
  user.artTempo = faker.number.int({ min: 0, max: 100 });
  user.profileImgUrl = faker.image.avatar();
  user.isEmailSubscribed = faker.helpers.arrayElement([true, false]);
  user.isPushEnabled = faker.helpers.arrayElement([true, false]);
  user.socialId = faker.string.uuid();
  user.socialProvider = faker.helpers.arrayElement([
    SocialProvider.KAKAO,
    SocialProvider.GOOGLE,
    SocialProvider.NAVER,
  ]);

  return user;
});
