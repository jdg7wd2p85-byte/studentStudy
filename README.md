# 学习岛日记

一个面向手机端使用的七年级学习网站。当前版本面向上海初中学习场景，包含学习菜单、内容录入、复习、出题、报告、梦想记录和火箭发射小游戏。英文单词功能仍然保留，并放在菜单里的 `英语 / 单词`。

线上地址：

http://47.116.213.24/

## 当前功能

- 手机端优先的录入、复习、列表、出题页面
- 首页学习菜单：语文、英语、数学、物理、化学、生物、地理
- 英语单词可从菜单直达，也可访问 `/#english-words`
- 语文支持背诵、生词、课文/古诗入口
- 英语支持单词、语法、作文入口
- 数学、物理、化学、生物、地理提供第一版分类入口
- 梦想模块：先用本机浏览器保存孩子的目标和愿望
- 火箭发射小游戏：可调推力和重力，支持一级分离和回收
- 支持科目、类别、来源、标签
- 支持批量粘贴解析
- 支持 Obsidian 风格输入，例如 `#英文单词 memory %%记忆%%`
- 支持尾部序号解析，例如 `#英文单词 Chamomile %%洋甘菊%% 1`
- 录入重复内容时自动去重
- 新录入内容立即进入今日复习
- 闪卡复习默认只展示正面，点击后展示答案
- 复习结果支持 `不会 / 模糊 / 基本会 / 熟练`
- 根据掌握情况计算下一次复习时间
- 列表页支持勾选学习项并生成练习卷预览
- 列表页支持按科目、类别、关键词、标签筛选
- 列表页展示每项录入时间、背诵次数、掌握分和下次复习时间
- 首页展示总数、薄弱项、今日待复习，以及科目/类别模块统计
- 报告页展示学习项总数、累计背诵次数、薄弱项、平均掌握分和模块分析

## 使用方式

### 录入

进入 `录入` 页，选择孩子、科目、类别，粘贴内容后点击 `解析预览`，确认无误后点击 `保存解析结果`。

支持的输入示例：

```text
#英文单词 memory %%记忆%%
#英文单词 Chamomile %%洋甘菊%% 1
efficient: 高效的
apple 苹果
```

保存后，相同孩子、相同类别、相同标题和答案的内容会自动复用已有记录，不重复新增。

### 复习

进入 `复习` 页：

- 默认只显示正面内容
- 点击 `显示答案` 后查看答案
- 根据掌握情况点击 `不会 / 模糊 / 基本会 / 熟练`
- 系统会写入复习记录，并计算下一次复习时间

### 出题

进入 `列表` 页，勾选学习项后点击 `生成练习卷`。系统会自动跳到 `出题` 页展示题目预览。

### 报告

进入 `报告` 页可以查看最近 60 天背诵热力图，以及每天背了多少个、覆盖多少类别、掌握多少个。

### 梦想

进入 `梦想` 页，可以记录孩子说过的目标和画面，例如 `想考270分，以后买大别墅，在阳台装空调给猫`。当前版本先保存在当前浏览器，后续可升级为数据库同步。

### 火箭

进入 `火箭` 页，可以玩一个轻量物理实验：调整推力和重力，观察火箭上升，点击 `分离一级` 体现质量变化，点击 `回收` 模拟软着陆。

## 复习规则

新内容录入后会立即进入今日待复习。每次复习后，根据评分调整掌握分和复习阶段：

- `不会`：降低掌握分，下一次安排到明天
- `模糊`：小幅降低掌握分，按当前阶段安排
- `基本会`：提高掌握分，进入下一阶段
- `熟练`：提高掌握分，阶段前进更快

当前轻量间隔为：

```text
1 天、2 天、4 天、7 天、15 天、30 天、60 天
```

## 技术栈

- Java 17
- Spring Boot 3.3.7
- Spring JDBC
- MySQL 8
- 原生 HTML / CSS / JavaScript
- Maven

## 本地开发

准备 MySQL 数据库：

```sql
CREATE DATABASE student_study DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'student_study'@'%' IDENTIFIED BY 'student_study';
GRANT ALL PRIVILEGES ON student_study.* TO 'student_study'@'%';
FLUSH PRIVILEGES;
```

启动应用：

```bash
mvn spring-boot:run
```

默认访问：

```text
http://127.0.0.1:28090/
```

也可以通过环境变量覆盖配置：

```bash
export PORT=28090
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3306/student_study?useUnicode=true&characterEncoding=utf8&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai'
export SPRING_DATASOURCE_USERNAME='student_study'
export SPRING_DATASOURCE_PASSWORD='student_study'
mvn spring-boot:run
```

## 测试与打包

运行测试：

```bash
mvn test
```

打包：

```bash
mvn package -DskipTests
```

生成的 jar：

```text
target/student-study-0.1.0-SNAPSHOT.jar
```

## 部署说明

当前线上部署在阿里云 ECS：

- 应用目录：`/opt/student-study/student-study.jar`
- 服务：`student-study.service`
- 应用端口：`28090`
- Nginx：公网 80 反向代理到 `127.0.0.1:28090`
- 数据库：MySQL，库名 `student_study`

常用命令：

```bash
systemctl status student-study
systemctl restart student-study
journalctl -u student-study -n 100 --no-pager
```

## 文档

更完整的产品设计、数据库模型和页面规划见：

```text
docs/student-study-design.md
```

## 后续规划

- 列表页按科目、类别、标签筛选
- PDF 导出练习卷
- 更完整的趋势图和阶段报表
- 梦想模块接入数据库，支持长期愿望墙
- 火箭小游戏增加关卡、得分、空气阻力和多级回收
- 支持更多输入格式和题型
- 后续可扩展微信小程序端
