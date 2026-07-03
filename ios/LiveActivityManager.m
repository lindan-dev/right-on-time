#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveActivityManager, NSObject)

RCT_EXTERN_METHOD(startActivity:(NSString *)name
                  emoji:(NSString *)emoji
                  endTimeSeconds:(double)endTimeSeconds)

RCT_EXTERN_METHOD(stopActivity)

@end
