import app from '../app';

import Component from '../../common/Component';
import listItems from '../../common/helpers/listItems';
import Button from '../../common/components/Button';
import LoadingIndicator from '../../common/components/LoadingIndicator';
import Notification from '../../common/models/Notification';
import Discussion from '../../common/models/Discussion';

/**
 * The `NotificationList` component displays a list of the logged-in user's
 * notifications, grouped by discussion.
 */
export default class NotificationList extends Component {
    /**
     * Whether or not the notifications are loading.
     */
    loading: boolean = false;

    /**
     * Whether or not there are more results that can be loaded.
     */
    moreResults: boolean = false;

    private $scrollParent: ZeptoCollection;
    private scrollHandler: () => void;

    view() {
        const pages = app.cache.notifications || [];

        return (
            <div className="NotificationList">
                <div className="NotificationList-header">
                    <div className="App-primaryControl">
                        {Button.component({
                            className: 'Button Button--icon Button--link',
                            icon: 'fas fa-check',
                            title: app.translator.transText('core.forum.notifications.mark_all_as_read_tooltip'),
                            onclick: this.markAllAsRead.bind(this),
                        })}
                    </div>

                    <h4 className="App-titleControl App-titleControl--text">{app.translator.trans('core.forum.notifications.title')}</h4>
                </div>

                <div className="NotificationList-content">
                    {pages.length
                        ? pages.map(notifications => {
                              const groups: { discussion: Discussion; notifications: Notification[] }[] = [];
                              const discussions = {};

                              notifications.forEach(notification => {
                                  const subject = notification.subject();

                                  if (typeof subject === 'undefined') return;

                                  // Get the discussion that this notification is related to. If it's not
                                  // directly related to a discussion, it may be related to a post or
                                  // other entity which is related to a discussion.
                                  let discussion: any = false;
                                  if (subject instanceof Discussion) discussion = subject;
                                  else if (subject && subject.discussion) discussion = subject.discussion();

                                  // If the notification is not related to a discussion directly or
                                  // indirectly, then we will assign it to a neutral group.
                                  const key = discussion ? discussion.id() : 0;
                                  discussions[key] = discussions[key] || { discussion: discussion, notifications: [] };
                                  discussions[key].notifications.push(notification);

                                  if (groups.indexOf(discussions[key]) === -1) {
                                      groups.push(discussions[key]);
                                  }
                              });

                              return groups.map(group => {
                                  const badges = group.discussion?.badges().toArray();

                                  return (
                                      <div className="NotificationGroup">
                                          {group.discussion ? (
                                              <m.route.Link className="NotificationGroup-header" href={app.route.discussion(group.discussion)}>
                                                  {badges && badges.length ? (
                                                      <ul className="NotificationGroup-badges badges">{listItems(badges)}</ul>
                                                  ) : (
                                                      ''
                                                  )}
                                                  {group.discussion.title()}
                                              </m.route.Link>
                                          ) : (
                                              <div className="NotificationGroup-header">{app.forum.attribute('title')}</div>
                                          )}

                                          <ul className="NotificationGroup-content">
                                              {group.notifications.map(notification => {
                                                  const NotificationComponent = app.notificationComponents[notification.contentType()];
                                                  return NotificationComponent ? <li>{NotificationComponent.component({ notification })}</li> : '';
                                              })}
                                          </ul>
                                      </div>
                                  );
                              });
                          })
                        : ''}
                    {this.loading ? (
                        <LoadingIndicator className="LoadingIndicator--block" />
                    ) : pages.length ? (
                        ''
                    ) : (
                        <div className="NotificationList-empty">{app.translator.trans('core.forum.notifications.empty_text')}</div>
                    )}
                </div>
            </div>
        );
    }

    oncreate(vnode) {
        super.oncreate(vnode);

        const $notifications = this.$('.NotificationList-content');
        const $scrollParent = (this.$scrollParent = $notifications.css('overflow') === 'auto' ? $notifications : $(window));

        this.scrollHandler = () => {
            const scrollTop = $scrollParent.scrollTop();
            const viewportHeight = $scrollParent.height();
            const contentTop = $scrollParent === $notifications ? 0 : $notifications.offset().top;
            const contentHeight = $notifications[0].scrollHeight;

            if (this.moreResults && !this.loading && scrollTop + viewportHeight >= contentTop + contentHeight) {
                this.loadMore();
            }
        };

        $scrollParent.on('scroll', this.scrollHandler);

        this.load();
    }

    onremove(vnode) {
        super.onremove(vnode);

        this.$scrollParent.off('scroll', this.scrollHandler);
    }

    /**
     * Load notifications into the application's cache if they haven't already
     * been loaded.
     */
    load() {
        if (app.session.user.newNotificationCount()) {
            delete app.cache.notifications;
        }

        if (app.cache.notifications) {
            return;
        }

        app.session.user.pushAttributes({ newNotificationCount: 0 });

        this.loadMore();
    }

    /**
     * Load the next page of notification results.
     */
    loadMore() {
        this.loading = true;
        m.redraw();

        const params = app.cache.notifications ? { page: { offset: app.cache.notifications.length * 10 } } : null;

        return app.store
            .find<Notification>('notifications', params)
            .then(this.parseResults.bind(this))
            .catch(() => {})
            .then(() => {
                this.loading = false;
                m.redraw();
            });
    }

    /**
     * Parse results and append them to the notification list.
     */
    parseResults(results: Notification[]): Notification[] {
        app.cache.notifications = app.cache.notifications || [];

        if (results.length) app.cache.notifications.push(results);

        this.moreResults = !!results.payload.links.next;

        return results;
    }

    /**
     * Mark all of the notifications as read.
     */
    markAllAsRead() {
        if (!app.cache.notifications) return;

        app.session.user.pushAttributes({ unreadNotificationCount: 0 });

        app.cache.notifications.forEach(notifications => {
            notifications.forEach(notification => notification.pushAttributes({ isRead: true }));
        });

        app.request({
            url: `${app.forum.attribute('apiUrl')}/notifications/read`,
            method: 'POST',
        });
    }
}
