# 第四阶段功能

## 功能描述

通过sqlite维护助手和用户的基本信息，新建各个表，并插入初始化数据信息，skills表我觉得可以删除，因为目前skills都是采用markdown文件的形式存在的，这个我希望和社区保持一致

### 新增定时任务表
> 参考openclaw的HEARTBEAT.md实现

将目前存在的 agents、users、souls、identities、change_history以及新建的heartbeats表和当前的llm的功能联系起来，这样可以让用户在每次对话的时候，都可以从sqlite中读取这些固定的配置，帮助用户更好的提供个人助手服务

------

# 其他

我希望你能帮我将server中的HTML部分迁移到ui中使用html文件维护，而且将css部分代码和js代码页分拆开来维护，现在的UI确实有些太过于简陋了，可以适当的优化一下UI，我希望尽可能的还是采用中文文案，因为主要面向的是中国用户。