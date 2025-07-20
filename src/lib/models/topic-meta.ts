
export class TopicMeta {
  topic: string;
  unsubbing: boolean;
  lastSubbed?: number;
  lastUnsubbed?: number;
  private constructor(topic: string) {
    this.topic = topic;
    this.unsubbing = false;
  }
  static init(topic: string): TopicMeta {
    let topicMeta: TopicMeta;
    topicMeta = new TopicMeta(topic);
    return topicMeta;
  }
}
